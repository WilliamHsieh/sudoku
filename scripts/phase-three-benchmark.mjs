// Isolated per-technique CPU benchmark. Production browser Worker timings are
// measured separately by phase-three-worker-benchmark.mjs.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { assertOracleStep, validateCorpusFixture } from "../src/hints/phase-three-oracle.mjs";

if (!isMainThread) {
  const start = performance.now();
  const { findStep } = await import("../src/hints/engine.js");
  parentPort.postMessage({ ready: true, startupMs: performance.now() - start });
  parentPort.on("message", ({ requestId, fixture, techniqueId }) => {
    try {
      const prepStart = performance.now();
      const values = [...fixture.values].map(Number),
        masks = [...fixture.masks];
      const prepMs = performance.now() - prepStart;
      const hrStart = process.hrtime.bigint(),
        begin = performance.now();
      const step = findStep(values, masks, techniqueId);
      const computeMs = performance.now() - begin;
      const hrtimeMs = Number(process.hrtime.bigint() - hrStart) / 1e6;
      parentPort.postMessage({ requestId, step, computeMs, hrtimeMs, prepMs });
    } catch (error) {
      parentPort.postMessage({ requestId, error: String(error) });
    }
  });
} else {
  await main();
}

function argument(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
}
function quantiles(samples) {
  if (!samples.length) return { n: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  return { n: sorted.length, p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: sorted.at(-1) };
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const fixturePath = path.resolve(
    root,
    argument("corpus", "src/hints/fixtures/phase-three-corpus.json")
  );
  const output = path.resolve(root, argument("output", ".lavish/phase-three/benchmark.json"));
  const samplesPerBoard = Number(argument("samples", "200"));
  const warmups = Number(argument("warmups", "5"));
  const maxBoards = Number(argument("boards", "3"));
  const timeoutMs = Number(argument("timeout-ms", "5000"));
  if (
    ![samplesPerBoard, warmups, maxBoards, timeoutMs].every(Number.isInteger) ||
    samplesPerBoard < 1 ||
    warmups < 0 ||
    maxBoards < 1 ||
    timeoutMs < 1
  )
    throw new Error("Invalid benchmark arguments");
  const data = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const defaults = JSON.parse(
    await fs.readFile(
      new URL("../src/hints/fixtures/phase-three-corpus.json", import.meta.url),
      "utf8"
    )
  );
  const queryFilter = argument("technique", null);
  const queries = defaults.queries.filter(
    (query) => !queryFilter || query.techniqueId === queryFilter
  );
  if (!queries.length) throw new Error("No matching technique");
  const report = {
    schema: 1,
    startedAt: new Date().toISOString(),
    scope:
      "Fresh input arrays + findStep exact technique in one isolated warm Node worker; compute includes input validation, detector and explanation payload. Independent DLX semantic proof is outside timed region. Node request roundtrip is not the production browser Worker budget.",
    statistics:
      "Nearest-rank empirical p50/p95/p99, each call measured individually in milliseconds. These are observed distributions for selected boards, not population or device guarantees. No batching/division. Errors and watchdog timeouts are never misses and never silently dropped.",
    input: {
      path: fixturePath,
      fixtures: data.fixtures.length,
      distinctOriginalPuzzles: new Set(data.fixtures.map((f) => f.source)).size,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
    },
    options: { samplesPerBoard, warmups, maxBoardsPerOutcome: maxBoards, timeoutMs },
    queries: [],
    selectedFixtures: [],
    samples: [],
    errors: [],
    workerStartups: [],
  };
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
  let worker = null,
    requestId = 0;
  const validatedFixtures = new Set();
  const verifiedSteps = new Set();
  const verify = (fixture, techniqueId, step) => {
    const signature = `${fixture.id}:${techniqueId}:${JSON.stringify(step)}`;
    if (!verifiedSteps.has(signature)) {
      assertOracleStep([...fixture.values].map(Number), fixture.masks, step);
      verifiedSteps.add(signature);
    }
  };
  async function startWorker() {
    worker = new Worker(new URL(import.meta.url));
    const hello = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    report.workerStartups.push(hello.startupMs);
  }
  async function call(fixture, techniqueId) {
    if (!worker) await startWorker();
    const id = ++requestId,
      begin = performance.now();
    return await new Promise((resolve) => {
      const active = worker;
      const finish = (value) => {
        clearTimeout(timer);
        active.removeListener("message", receive);
        active.removeListener("error", error);
        resolve({ ...value, roundTripMs: performance.now() - begin });
      };
      const receive = (value) => {
        if (value.requestId === id) finish(value);
      };
      const error = (error) => {
        worker = null;
        finish({ error: String(error) });
      };
      const timer = setTimeout(() => {
        worker = null;
        active.terminate();
        finish({ timeout: true, error: `Watchdog timeout after ${timeoutMs} ms` });
      }, timeoutMs);
      active.on("message", receive);
      active.once("error", error);
      active.postMessage({ requestId: id, fixture, techniqueId });
    });
  }
  const save = async () => {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
  };
  try {
    for (const query of queries) {
      const techniqueId = query.techniqueId;
      const preferred = new Set(query.priorFound);
      const ordered = [...data.fixtures].sort(
        (a, b) => Number(preferred.has(b.id)) - Number(preferred.has(a.id))
      );
      const selected = { found: [], miss: [] },
        sources = { found: new Set(), miss: new Set() };
      const discovery = { probes: 0, found: 0, miss: 0, errors: 0, timeouts: 0, rejected: 0 };
      for (const fixture of ordered) {
        if (selected.found.length >= maxBoards && selected.miss.length >= maxBoards) break;
        // Avoid solved/nearly solved negative controls. Prior positive discovery
        // can still use a late genuine state if that is the only available hit.
        const filled = [...fixture.values].filter((digit) => digit !== "0").length;
        if (filled >= 70) continue;
        const reply = await call(fixture, techniqueId);
        discovery.probes++;
        if (reply.error) {
          discovery.errors++;
          if (reply.timeout) discovery.timeouts++;
          report.errors.push({ stage: "discovery", techniqueId, fixture: fixture.id, ...reply });
          continue;
        }
        const outcome = reply.step ? "found" : "miss";
        discovery[outcome]++;
        const entries = fixture.masks.reduce(
          (sum, mask) => sum + [...mask.toString(2)].filter((digit) => digit === "1").length,
          0
        );
        if (outcome === "miss" && (filled > 60 || entries < 60)) continue;
        if (selected[outcome].length >= maxBoards || sources[outcome].has(fixture.source)) continue;
        try {
          if (!validatedFixtures.has(fixture.id)) {
            validateCorpusFixture(fixture);
            validatedFixtures.add(fixture.id);
          }
          if (reply.step) verify(fixture, techniqueId, reply.step);
        } catch (error) {
          discovery.rejected++;
          report.errors.push({
            stage: "oracle",
            techniqueId,
            fixture: fixture.id,
            error: String(error),
          });
          continue;
        }
        sources[outcome].add(fixture.source);
        selected[outcome].push({ fixture, expected: outcome, step: reply.step });
      }
      const cases = [...selected.found, ...selected.miss];
      const summary = {
        techniqueId,
        discovery,
        foundBoards: selected.found.length,
        missBoards: selected.miss.length,
        coverage: selected.found.length && selected.miss.length ? "found-and-miss" : "incomplete",
        boards: [],
        pooled: [],
      };
      console.log(
        `${techniqueId}: ${selected.found.length} found + ${selected.miss.length} miss boards (${discovery.probes} probes)`
      );
      for (const item of cases) {
        report.selectedFixtures.push({
          techniqueId,
          expected: item.expected,
          ...item.fixture,
          discoveryStep: item.step,
        });
        for (let trial = 0; trial < warmups; trial++) {
          const reply = await call(item.fixture, techniqueId);
          if (reply.error)
            report.errors.push({
              stage: "warmup",
              techniqueId,
              fixture: item.fixture.id,
              trial,
              ...reply,
            });
        }
      }
      for (let trial = 0; trial < samplesPerBoard; trial++) {
        for (const item of trial % 2 ? [...cases].reverse() : cases) {
          const reply = await call(item.fixture, techniqueId);
          const actual = reply.step ? "found" : "miss";
          if (
            reply.error ||
            actual !== item.expected ||
            (reply.step && reply.step.techniqueId !== techniqueId)
          ) {
            report.errors.push({
              stage: "measurement",
              techniqueId,
              fixture: item.fixture.id,
              trial,
              expected: item.expected,
              actual,
              ...reply,
            });
            continue;
          }
          if (reply.step) {
            try {
              verify(item.fixture, techniqueId, reply.step);
            } catch (error) {
              report.errors.push({
                stage: "measurement",
                techniqueId,
                fixture: item.fixture.id,
                trial,
                error: String(error),
              });
              continue;
            }
          }
          report.samples.push({
            techniqueId,
            fixture: item.fixture.id,
            source: item.fixture.source,
            outcome: actual,
            trial: trial + 1,
            computeMs: reply.computeMs,
            hrtimeMs: reply.hrtimeMs,
            prepMs: reply.prepMs,
            roundTripMs: reply.roundTripMs,
          });
        }
      }
      for (const item of cases) {
        const samples = report.samples.filter(
          (s) => s.techniqueId === techniqueId && s.fixture === item.fixture.id
        );
        const censored = report.errors.some(
          (e) =>
            e.stage === "measurement" &&
            e.techniqueId === techniqueId &&
            e.fixture === item.fixture.id
        );
        summary.boards.push({
          fixture: item.fixture.id,
          source: item.fixture.source,
          outcome: item.expected,
          censored,
          computeMs: censored ? null : quantiles(samples.map((s) => s.computeMs)),
          roundTripMs: censored ? null : quantiles(samples.map((s) => s.roundTripMs)),
        });
      }
      for (const outcome of ["found", "miss"]) {
        const samples = report.samples.filter(
          (s) => s.techniqueId === techniqueId && s.outcome === outcome
        );
        const censored = summary.boards.some((b) => b.outcome === outcome && b.censored);
        summary.pooled.push({
          outcome,
          distinctOriginalPuzzles: sources[outcome].size,
          censored,
          computeMs: censored ? null : quantiles(samples.map((s) => s.computeMs)),
          roundTripMs: censored ? null : quantiles(samples.map((s) => s.roundTripMs)),
        });
      }
      report.queries.push(summary);
      await save();
    }
    report.completedAt = new Date().toISOString();
    report.independentOracle = {
      algorithm: "Algorithm X / dancing links",
      originalUniqueFixtures: validatedFixtures.size,
      distinctVerifiedSteps: verifiedSteps.size,
      status: report.errors.some((error) => error.stage === "oracle")
        ? "rejections-recorded"
        : "passed",
    };
    await save();
    console.log(
      `Saved ${report.samples.length} samples to ${output}; ${report.errors.length} errors.`
    );
  } finally {
    if (worker) await worker.terminate();
  }
}
