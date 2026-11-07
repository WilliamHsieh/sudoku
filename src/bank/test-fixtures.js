import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { importCatalog } from "./import.js";
import { pinnedSource } from "./source.js";
import { grade } from "./grade.js";
import { applyEvent, projectRecords } from "./records.js";

export const source = pinnedSource(["synthetic.txt"]);
export const fixtureText = readFileSync(
  new URL("./fixtures/boundaries.txt", import.meta.url),
  "utf8"
);
export const fixtureLines = fixtureText.trimEnd().split("\n");
export async function fixtureCatalog(maxPerLevel = 500) {
  return importCatalog(
    fixtureLines.map((line) => ({ line, sourceBucket: "easy.txt" })),
    { catalogVersion: "fixture-v1", source, maxPerLevel }
  );
}
/** Synthetic consistent boards. The ratings test rules, not a solver or real puzzle difficulty.
 * @param {number} number @param {number} ratingTenths @returns {import('./types.js').Puzzle} */
export function puzzle(number, ratingTenths = 13) {
  const solved =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
  const digits = [...solved]
    .map((v, i) => (i === 80 || (i < 16 && ((number >>> i) & 1) === 1) ? "0" : v))
    .join("");
  return {
    id: createHash("sha1").update(digits).digest("hex"),
    digits,
    ratingTenths,
    level: grade(ratingTenths),
  };
}
/** @param {number[]} ratings @returns {import('./types.js').Catalog} */
export function catalogWith(ratings) {
  return {
    schema: 1,
    catalogVersion: "synthetic-v1",
    source,
    puzzles: ratings.map((r, i) => puzzle(i, r)),
  };
}
/** @param {number} number @param {Partial<import('./types.js').Start>} [overrides] @returns {import('./types.js').Start} */
export function start(number, overrides = {}) {
  return {
    attemptId: `attempt-${number}`,
    playerId: "player",
    puzzle: puzzle(number),
    catalogVersion: "fixture-v1",
    source,
    mode: "medium",
    ruleVersion: "selection-v1",
    reason: { codes: ["test"], detail: "Synthetic player sequence" },
    replay: false,
    settings: { candidateMode: "manual" },
    ...overrides,
  };
}
/** @param {number} number @param {Partial<import('./types.js').Start>} [overrides]
 * @param {'complete'|'give_up'|'hint'|'reveal'|'pause'} [outcome]
 * @param {import('./types.js').Feedback} [feedback] */
export function attempt(number, overrides = {}, outcome = "complete", feedback) {
  const data = start(number, overrides);
  /** @type {import('./types.js').RecordLog} */
  let log = { schema: 1, events: [] };
  log = applyEvent(log, {
    id: "start",
    attemptId: data.attemptId,
    at: number * 100,
    type: "start",
    start: data,
  });
  log = applyEvent(log, {
    id: "outcome",
    attemptId: data.attemptId,
    at: number * 100 + 1,
    type: outcome,
  });
  if (outcome === "hint")
    log = applyEvent(log, {
      id: "complete",
      attemptId: data.attemptId,
      at: number * 100 + 2,
      type: "complete",
    });
  if (feedback)
    log = applyEvent(log, {
      id: "feedback",
      attemptId: data.attemptId,
      at: number * 100 + 3,
      type: "feedback",
      feedback,
    });
  return projectRecords(log)[0];
}
export function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (/** @type {string} */ key) => data.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
      data.set(key, value);
    },
  };
}
