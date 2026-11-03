import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import { createHash } from "node:crypto";
import corpus from "../src/hints/fixtures/phase-three-corpus.json" with { type: "json" };
import { newGame, computedCandidates } from "../src/game/game.js";
import { findHint } from "../src/hints/engine.js";
import { hintSnapshot, hintStateKey } from "../src/hints/hint.js";
import { assertOracleStep, validateCorpusFixture } from "../src/hints/phase-three-oracle.mjs";
import { openBoard } from "./helpers.js";

const caseIds = [
  "upstream-example:XY_CHAIN",
  "upstream-example:AIC",
  "upstream-example:DEATH_BLOSSOM",
  ...corpus.workerMisses,
];

test("actual bundled cold Worker latency and independent proofs", async ({ page }, info) => {
  test.setTimeout(240000);
  const cases = caseIds.map((id) => {
    const fixture = corpus.fixtures.find((fixture) => fixture.id === id);
    if (!fixture) throw new Error(`Missing benchmark fixture: ${id}`);
    validateCorpusFixture(fixture);
    const state = newGame(fixture.puzzle, { notesMode: "auto" });
    state.answers = [...fixture.values].map((digit, cell) =>
      state.givens[cell] ? 0 : Number(digit)
    );
    state.autoRemoved = fixture.masks.map((mask, cell) => computedCandidates(state, cell) & ~mask);
    const hint = findHint(state);
    if (hint) assertOracleStep([...fixture.values].map(Number), fixture.masks, hint.proof.step);
    const snapshot = hintSnapshot(state);
    return {
      fixture,
      state: snapshot,
      key: hintStateKey(snapshot),
      expected: hint ? "found" : "miss",
      techniqueId: hint?.techniqueId ?? null,
    };
  });
  expect(cases.filter((row) => row.expected === "found")).toHaveLength(3);
  expect(cases.filter((row) => row.expected === "miss")).toHaveLength(3);
  const host = {
    node: process.version,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    loadBefore: os.loadavg(),
    commit: process.env.GITHUB_SHA ?? "local",
    runId: process.env.GITHUB_RUN_ID ?? null,
    note: "CI runs under ordinary shard load, not an isolated calibrated device. Browser timing is descriptive, not a phone or population latency guarantee.",
  };
  await openBoard(page);
  const [firstWorker] = await Promise.all([
    page.waitForEvent("worker"),
    page.locator("#hint-trigger").click(),
  ]);
  const workerURL = firstWorker.url();
  expect(workerURL).toMatch(/engine\.worker/);
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  await page.locator("#hint-panel").getByRole("button", { name: "收起提示" }).click();

  const report = await page.evaluate(
    async ({ cases, workerURL }) => {
      const options = { samplesPerBoard: 100, warmups: 3, timeoutMs: 3000 };
      let sequence = 0;
      const result = {
        schema: 1,
        startedAt: new Date().toISOString(),
        workerURL,
        options,
        scope:
          "Actual built engine.worker.js discovered from a real application hint request. Fresh native Worker per call: cold JS context/module initialization, snapshot structured clone, fingerprint, Auto candidate reconstruction, complete first-eligible technique ladder, production semantic proof and response roundtrip. Input snapshot creation, provider receipt registration and UI rendering are outside this measurement and are exercised by separate functional e2e tests. Browser HTTP cache is warm.",
        statistics:
          "Nearest-rank empirical p50/p95/p99 from individual millisecond requests. Errors and 3,000ms watchdog timeouts are censored, never misses or silently dropped. The three no-step cases are real incomplete, original-unique progressed boards, not empty or truncated controls.",
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        samples: [],
        errors: [],
        proofs: [],
        boards: [],
        pooled: [],
      };
      const quantiles = (samples) => {
        const sorted = [...samples].sort((a, b) => a - b);
        const rank = (p) => (sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null);
        return {
          n: sorted.length,
          p50: rank(0.5),
          p95: rank(0.95),
          p99: rank(0.99),
          max: sorted.at(-1) ?? null,
        };
      };
      const run = (item) =>
        new Promise((resolve) => {
          const id = ++sequence,
            begin = performance.now();
          let worker;
          const finish = (reply) => {
            clearTimeout(timer);
            worker?.terminate();
            resolve({ elapsedMs: performance.now() - begin, ...reply });
          };
          const timer = setTimeout(
            () => finish({ timeout: true, error: "Worker watchdog: 3000ms" }),
            options.timeoutMs
          );
          try {
            worker = new Worker(workerURL, { type: "module" });
            worker.onmessage = ({ data }) => {
              if (data.id !== id || data.key !== item.key) {
                finish({ error: "Mismatched Worker response fingerprint" });
                return;
              }
              if (data.error) {
                finish({ error: data.error });
                return;
              }
              finish({ outcome: data.hint ? "found" : "miss", hint: data.hint });
            };
            worker.onerror = () => finish({ error: "Worker error" });
            worker.onmessageerror = () => finish({ error: "Worker message error" });
            worker.postMessage({ id, key: item.key, state: item.state });
          } catch (error) {
            finish({ error: String(error) });
          }
        });
      for (const item of cases)
        for (let trial = 0; trial < options.warmups; trial++) {
          const reply = await run(item);
          if (reply.error)
            result.errors.push({ stage: "warmup", fixture: item.fixture.id, ...reply });
        }
      outer: for (let trial = 0; trial < options.samplesPerBoard; trial++) {
        for (const item of trial % 2 ? [...cases].reverse() : cases) {
          const reply = await run(item);
          if (
            reply.error ||
            reply.outcome !== item.expected ||
            (reply.hint?.techniqueId ?? null) !== item.techniqueId
          ) {
            result.errors.push({
              stage: "measurement",
              fixture: item.fixture.id,
              trial: trial + 1,
              expected: item.expected,
              ...reply,
            });
            break outer;
          }
          result.samples.push({
            fixture: item.fixture.id,
            source: item.fixture.source,
            outcome: reply.outcome,
            techniqueId: reply.hint?.techniqueId ?? null,
            trial: trial + 1,
            elapsedMs: reply.elapsedMs,
          });
          if (
            reply.hint &&
            !result.proofs.some(
              (proof) =>
                proof.fixture === item.fixture.id &&
                JSON.stringify(proof.step) === JSON.stringify(reply.hint.proof.step)
            )
          )
            result.proofs.push({ fixture: item.fixture.id, step: reply.hint.proof.step });
        }
      }
      for (const item of cases) {
        const samples = result.samples.filter((row) => row.fixture === item.fixture.id);
        const censored =
          samples.length !== options.samplesPerBoard ||
          result.errors.some((row) => row.fixture === item.fixture.id);
        result.boards.push({
          fixture: item.fixture.id,
          source: item.fixture.source,
          outcome: item.expected,
          techniqueId: item.techniqueId,
          censored,
          elapsedMs: censored ? null : quantiles(samples.map((row) => row.elapsedMs)),
        });
      }
      for (const outcome of ["found", "miss"]) {
        const samples = result.samples.filter((row) => row.outcome === outcome),
          boards = result.boards.filter((board) => board.outcome === outcome);
        const censored = boards.some((board) => board.censored);
        result.pooled.push({
          outcome,
          distinctOriginalPuzzles: new Set(boards.map((board) => board.source)).size,
          censored,
          elapsedMs: censored ? null : quantiles(samples.map((row) => row.elapsedMs)),
        });
      }
      result.completedAt = new Date().toISOString();
      return result;
    },
    { cases, workerURL }
  );
  report.host = { ...host, loadAfter: os.loadavg() };
  report.sourceHashes = {};
  for (const name of [
    "engine.js",
    "engine-advanced.js",
    "engine-advanced-patterns.js",
    "engine-advanced-chains.js",
    "engine-als.js",
    "proof-verifier.js",
  ])
    report.sourceHashes[name] = createHash("sha256")
      .update(await fs.readFile(new URL(`../src/hints/${name}`, import.meta.url)))
      .digest("hex");
  for (const proof of report.proofs) {
    const fixture = corpus.fixtures.find((fixture) => fixture.id === proof.fixture);
    assertOracleStep([...fixture.values].map(Number), fixture.masks, proof.step);
  }
  report.independentOracle = {
    algorithm: "Algorithm X / dancing links",
    checkedProofVariants: report.proofs.length,
    status: "passed",
  };
  await info.attach("phase-three-worker-benchmark", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  console.log("Phase-three actual Worker timings", JSON.stringify(report.pooled));
  expect(report.errors).toEqual([]);
  expect(report.samples).toHaveLength(600);
  for (const row of report.pooled) expect(row.elapsedMs.p99).toBeLessThan(3000);
});
