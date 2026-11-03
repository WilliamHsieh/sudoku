// Broad semantic regression over numeric corpus states. No upstream detector
// implementation is loaded. Supply archived states in our fixture schema.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { findStep } from "../src/hints/engine.js";
import { ADVANCED_TECHNIQUES } from "../src/hints/engine-advanced.js";
import { assertOracleStep, validateCorpusFixture } from "../src/hints/phase-three-oracle.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const input = arg("corpus", "src/hints/fixtures/phase-three-corpus.json");
const output = arg("output", ".lavish/phase-three/correctness.json");
const data = JSON.parse(await fs.readFile(input, "utf8"));
const report = {
  schema: 1,
  startedAt: new Date().toISOString(),
  input,
  scope:
    "Every phase-three exact-technique detector on every supplied genuine state. Original puzzle uniqueness, placed values, candidate legality and solution retention rechecked independently. Every emitted effect proven by independent Algorithm X counterexample search, not merely compared with one solution. Logical elimination history is not replayed.",
  oracle:
    "Independent Algorithm X / dancing links, maximum 2,000,000 nodes per query. Budget exhaustion is inconclusive and recorded as an error, never accepted as proof.",
  fixtures: data.fixtures.length,
  originalPuzzles: new Set(data.fixtures.map((f) => f.source)).size,
  checkedFixtures: 0,
  validatedOriginals: [],
  strategies: ADVANCED_TECHNIQUES.map((techniqueId) => ({
    techniqueId,
    found: 0,
    miss: 0,
    effects: 0,
    oracleNodes: 0,
    maxDetectorMs: 0,
  })),
  errors: [],
  sourceHashes: {},
};
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
const originals = new Set();
const save = async () => {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
};
for (let index = 0; index < data.fixtures.length; index++) {
  const fixture = data.fixtures[index];
  try {
    validateCorpusFixture(fixture);
    if (!originals.has(fixture.source)) {
      originals.add(fixture.source);
      report.validatedOriginals.push({ source: fixture.source, puzzle: fixture.puzzle });
    }
  } catch (error) {
    report.errors.push({ stage: "fixture", fixture: fixture.id, error: String(error) });
    continue;
  }
  for (const row of report.strategies) {
    const values = [...fixture.values].map(Number),
      masks = [...fixture.masks];
    const initial = JSON.stringify({ values, masks });
    let step;
    try {
      const begin = performance.now();
      step = findStep(values, masks, row.techniqueId);
      row.maxDetectorMs = Math.max(row.maxDetectorMs, performance.now() - begin);
      if (initial !== JSON.stringify({ values, masks })) throw new Error("Detector mutated input");
      if (!step) {
        row.miss++;
        continue;
      }
      if (step.techniqueId !== row.techniqueId) throw new Error("Wrong technique ID");
      const proof = assertOracleStep(values, masks, step);
      row.found++;
      row.effects += proof.effects;
      row.oracleNodes += proof.nodes;
    } catch (error) {
      report.errors.push({
        stage: "detector-or-proof",
        fixture: fixture.id,
        source: fixture.source,
        techniqueId: row.techniqueId,
        error: String(error),
        step,
      });
      console.error(`${fixture.id} ${row.techniqueId}: ${String(error)}`);
    }
  }
  report.checkedFixtures++;
  if ((index + 1) % 100 === 0) {
    await save();
    console.log(`${index + 1}/${data.fixtures.length} states; ${report.errors.length} errors`);
  }
}
report.completedAt = new Date().toISOString();
report.status = report.errors.length ? "errors" : "passed";
await save();
console.log(
  JSON.stringify(
    {
      output,
      status: report.status,
      checkedFixtures: report.checkedFixtures,
      originalPuzzles: originals.size,
      effects: report.strategies.reduce((sum, row) => sum + row.effects, 0),
      errors: report.errors.length,
    },
    null,
    2
  )
);
if (report.errors.length) process.exitCode = 1;
