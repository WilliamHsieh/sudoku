import { performance } from "node:perf_hooks";
import { strict as assert } from "node:assert";
import { openCatalog } from "../src/bank/catalog.js";
import { projectRecords } from "../src/bank/records.js";
import { deriveAbility } from "../src/bank/ability.js";
import { selectPuzzle } from "../src/bank/select.js";
import { benchmarkFixture } from "./bank-benchmark-fixtures.mjs";
import { BASELINE_SHA, loadBaseline } from "./bank-baseline.mjs";

// Manual only: node scripts/bank-select-benchmark.mjs. No CI timing assertions.
const baseline = await loadBaseline();
try {
  const { catalog: input, log } = benchmarkFixture();
  const catalog = (await openCatalog(input)).catalog;
  const oldCatalog = (await baseline.catalog.openCatalog(input)).catalog;
  const records = projectRecords(log);
  const oldRecords = baseline.records.projectRecords(log);
  assert.equal(catalog.puzzles.length, 4000);
  assert.equal(records.length, 4000);
  assert.deepEqual(
    records.map((record) => {
      const copy = { ...record };
      delete copy.hintCount;
      return copy;
    }),
    oldRecords
  );
  const options = { records, playerId: "player", mode: "hard", seed: "benchmark" };
  const measure = (fn) => {
    const start = performance.now();
    const result = fn();
    return { ms: performance.now() - start, result };
  };
  const before = measure(() => baseline.select.selectPuzzle({ ...options, catalog: oldCatalog }));
  const cold = measure(() => selectPuzzle({ ...options, catalog }));
  assert.equal(JSON.stringify(cold.result), JSON.stringify(before.result));
  const median = (fn) => {
    const times = Array.from({ length: 5 }, () => measure(fn).ms).sort((a, b) => a - b);
    return times[2];
  };
  const rows = [
    {
      operation: "selectPuzzle first call (includes ability)",
      before_ms: before.ms,
      after_ms: cold.ms,
    },
    {
      operation: "selectPuzzle warm median (5 runs)",
      before_ms: median(() => baseline.select.selectPuzzle({ ...options, catalog: oldCatalog })),
      after_ms: median(() => selectPuzzle({ ...options, catalog })),
    },
    {
      operation: "deriveAbility warm median (5 runs)",
      before_ms: median(() => baseline.ability.deriveAbility({ ...options, catalog: oldCatalog })),
      after_ms: median(() => deriveAbility({ ...options, catalog })),
    },
    {
      operation: "projectRecords median (5 runs)",
      before_ms: median(() => baseline.records.projectRecords(log)),
      after_ms: median(() => projectRecords(log)),
    },
  ];
  console.log(
    `Node ${process.version}; ${process.platform}/${process.arch}; 4,000 puzzles, 4,000 attempts, ${log.events.length} events.`
  );
  console.log(
    `Baseline ${BASELINE_SHA}; catalog opening/index construction and fixture generation excluded.`
  );
  console.log(
    "Selection output matches baseline byte-for-byte; records match except added hintCount."
  );
  console.table(
    rows.map((r) => ({ ...r, before_ms: r.before_ms.toFixed(2), after_ms: r.after_ms.toFixed(2) }))
  );
} finally {
  await baseline.cleanup();
}
