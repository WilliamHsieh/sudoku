// Actual browser production Worker: cold module load + structured clone +
// candidate handling + complete first-hint ladder + proof + receipt roundtrip.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { assertOracleStep, validateCorpusFixture } from "../src/hints/phase-three-oracle.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const root = new URL("../", import.meta.url);
const output = path.resolve(arg("output", ".lavish/phase-three/worker-benchmark.json"));
const corpus = JSON.parse(
  await fs.readFile(
    new URL("../src/hints/fixtures/phase-three-corpus.json", import.meta.url),
    "utf8"
  )
);
const input = arg("corpus", null);
const data = input ? JSON.parse(await fs.readFile(input, "utf8")) : corpus;
const fixtures = data.selectedFixtures ?? data.fixtures;
const unique = [...new Map(fixtures.map((fixture) => [fixture.id, fixture])).values()];
for (const fixture of unique) validateCorpusFixture(fixture);
const options = {
  samples: Number(arg("samples", "100")),
  warmups: Number(arg("warmups", "3")),
  boards: Number(arg("boards", "3")),
  timeoutMs: Number(arg("timeout-ms", "3000")),
};
if (
  !Object.values(options).every((n) => Number.isInteger(n) && n >= 0) ||
  !options.samples ||
  !options.boards ||
  !options.timeoutMs
)
  throw new Error("Invalid Worker benchmark options");
let server = null,
  browser = null;
const baseURL = arg("base-url", "http://127.0.0.1:8137");
try {
  if (!process.argv.includes("--base-url")) {
    server = spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "8137", "--strictPort"],
      { cwd: root, stdio: "pipe" }
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Vite exited: ${server.exitCode}`);
      try {
        ready = (await fetch(baseURL)).ok;
      } catch {
        /* wait for startup */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Vite did not become ready");
  }
  let executablePath = arg("executable-path", process.env.CHROMIUM_PATH);
  if (!executablePath) {
    try {
      await fs.access("/usr/bin/chromium");
      executablePath = "/usr/bin/chromium";
    } catch {
      /* use Playwright's pinned executable */
    }
  }
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  await page.goto(baseURL);
  const report = await page.evaluate(
    async ({ fixtures, options }) => {
      const { createWorkerHintProvider } = await import("/src/hints/worker-provider.js");
      const { newGame, computedCandidates } = await import("/src/game/game.js");
      const provider = createWorkerHintProvider({ timeoutMs: options.timeoutMs });
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
      const stateFor = (fixture) => {
        const state = newGame(fixture.puzzle, { notesMode: "auto" });
        state.answers = [...fixture.values].map((digit, cell) =>
          state.givens[cell] ? 0 : Number(digit)
        );
        state.autoRemoved = fixture.masks.map(
          (mask, cell) => computedCandidates(state, cell) & ~mask
        );
        return state;
      };
      const run = async (fixture) => {
        const state = stateFor(fixture),
          begin = performance.now();
        try {
          const hint = await provider(state, { signal: new AbortController().signal });
          return { elapsedMs: performance.now() - begin, outcome: hint ? "found" : "miss", hint };
        } catch (error) {
          return {
            elapsedMs: performance.now() - begin,
            error: String(error),
            timeout: String(error).includes("timed out"),
          };
        }
      };
      const result = {
        schema: 1,
        startedAt: new Date().toISOString(),
        options,
        scope:
          "Actual production createWorkerHintProvider: fresh browser Worker on every call, module initialization, snapshot/fingerprint/structured clone, Auto candidate reconstruction, complete first-eligible technique ladder, production semantic proof, postMessage and verified receipt. Rendering excluded. This is the first-hint path, not a separate exact-technique query.",
        statistics:
          "Nearest-rank empirical percentiles, milliseconds per request. Cold Worker every trial; browser HTTP/module cache warm. Errors/timeouts are censored, never misses or silently dropped. Selected-board distributions are not population/device guarantees.",
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        discovery: [],
        selected: [],
        samples: [],
        errors: [],
        proofs: [],
        boards: [],
        pooled: [],
      };
      const sources = { found: new Set(), miss: new Set() };
      for (const fixture of fixtures) {
        if (sources.found.size >= options.boards && sources.miss.size >= options.boards) break;
        const reply = await run(fixture);
        result.discovery.push({ fixture: fixture.id, ...reply });
        if (reply.error) {
          result.errors.push({ stage: "discovery", fixture: fixture.id, ...reply });
          continue;
        }
        const outcome = reply.outcome;
        if (sources[outcome].size >= options.boards || sources[outcome].has(fixture.source))
          continue;
        sources[outcome].add(fixture.source);
        result.selected.push({
          fixture,
          expected: outcome,
          actualTechniqueId: reply.hint?.techniqueId ?? null,
        });
        if (reply.hint) result.proofs.push({ fixture: fixture.id, hint: reply.hint });
      }
      for (const selected of result.selected)
        for (let n = 0; n < options.warmups; n++) {
          const reply = await run(selected.fixture);
          if (reply.error)
            result.errors.push({ stage: "warmup", fixture: selected.fixture.id, ...reply });
        }
      for (let trial = 0; trial < options.samples; trial++) {
        for (const selected of trial % 2 ? [...result.selected].reverse() : result.selected) {
          const reply = await run(selected.fixture);
          const row = {
            fixture: selected.fixture.id,
            source: selected.fixture.source,
            trial: trial + 1,
            ...reply,
          };
          if (reply.error || reply.outcome !== selected.expected)
            result.errors.push({ stage: "measurement", ...row });
          else {
            result.samples.push({
              ...row,
              hint: undefined,
              techniqueId: reply.hint?.techniqueId ?? null,
            });
            if (
              reply.hint &&
              !result.proofs.some(
                (p) =>
                  p.fixture === row.fixture &&
                  JSON.stringify(p.hint.proof.step) === JSON.stringify(reply.hint.proof.step)
              )
            )
              result.proofs.push({ fixture: row.fixture, hint: reply.hint });
          }
        }
      }
      for (const selected of result.selected) {
        const samples = result.samples.filter((row) => row.fixture === selected.fixture.id);
        const censored = result.errors.some(
          (row) => row.stage === "measurement" && row.fixture === selected.fixture.id
        );
        result.boards.push({
          fixture: selected.fixture.id,
          source: selected.fixture.source,
          outcome: selected.expected,
          techniqueId: selected.actualTechniqueId,
          censored,
          elapsedMs: censored ? null : quantiles(samples.map((row) => row.elapsedMs)),
        });
      }
      for (const outcome of ["found", "miss"]) {
        const samples = result.samples.filter((row) => row.outcome === outcome);
        const censored = result.boards.some((board) => board.outcome === outcome && board.censored);
        result.pooled.push({
          outcome,
          boards: sources[outcome].size,
          censored,
          elapsedMs: censored ? null : quantiles(samples.map((row) => row.elapsedMs)),
        });
      }
      result.completedAt = new Date().toISOString();
      return result;
    },
    { fixtures: unique, options }
  );
  for (const { fixture: id, hint } of report.proofs) {
    const fixture = unique.find((fixture) => fixture.id === id);
    assertOracleStep([...fixture.values].map(Number), fixture.masks, hint.proof.step);
  }
  report.independentOracle = {
    algorithm: "Algorithm X / dancing links",
    fixtures: unique.length,
    proofVariants: report.proofs.length,
    status: "passed",
  };
  report.host = { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        output,
        pooled: report.pooled,
        errors: report.errors.length,
        oracle: report.independentOracle,
      },
      null,
      2
    )
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
}
