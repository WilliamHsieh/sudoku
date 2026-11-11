import { createHash } from "node:crypto";
import { grade } from "../src/bank/grade.js";
import { pinnedSource } from "../src/bank/source.js";

/** Synthetic legal boards and event histories; no upstream data or experience claims.
 * @returns {{catalog: import('../src/bank/types.js').Catalog, log: import('../src/bank/types.js').RecordLog}} */
export function benchmarkFixture(size = 4000) {
  const source = pinnedSource(["synthetic-benchmark.txt"]);
  const solved =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
  const ratings = [
    10, 12, 13, 15, 16, 19, 22, 25, 26, 29, 31, 32, 35, 44, 45, 48, 55, 56, 59, 64, 65, 68, 69, 70,
    73, 84, 85, 88,
  ];
  const puzzles = Array.from({ length: size }, (_, i) => {
    const digits = [...solved]
      .map((v, j) => (j === 80 || (j < 16 && (i >>> j) & 1) ? "0" : v))
      .join("");
    const ratingTenths = ratings[i % ratings.length];
    return {
      id: createHash("sha1").update(digits).digest("hex"),
      digits,
      ratingTenths,
      level: grade(ratingTenths),
    };
  });
  /** @type {import("../src/bank/types.js").Catalog} */
  const catalog = { schema: 1, catalogVersion: "benchmark-v1", source, puzzles };
  /** @type {import("../src/bank/types.js").PlayEvent[]} */
  const events = [];
  const modes = /** @type {const} */ (["easy", "medium", "hard", "manual"]);
  const outcomes = /** @type {const} */ ([
    "complete",
    "complete",
    "hint",
    "reveal",
    "give_up",
    "pause",
    "complete",
  ]);
  for (let i = 0; i < size; i++) {
    const attemptId = `attempt-${i}`;
    const at = i * 10 + 1;
    /** @type {import("../src/bank/types.js").Start} */
    const start = {
      attemptId,
      playerId: i % 17 === 0 ? "other" : "player",
      puzzle: puzzles[i % Math.ceil(size * 0.8)],
      catalogVersion: catalog.catalogVersion,
      source,
      mode: modes[i % modes.length],
      ruleVersion: "selection-v1",
      reason: { codes: ["synthetic"], detail: "Generated benchmark history" },
      replay: false,
      settings: { candidateMode: "manual" },
    };
    events.push({ id: "start", attemptId, at, type: "start", start });
    const type = outcomes[i % outcomes.length];
    events.push({ id: "outcome", attemptId, at: at + 1, type });
    if (type === "hint") events.push({ id: "complete", attemptId, at: at + 2, type: "complete" });
    if (type !== "pause" && i % 3 !== 0)
      events.push({
        id: "feedback",
        attemptId,
        at: at + 3,
        type: "feedback",
        feedback: i % 3 === 1 ? "light" : "struggle",
      });
  }
  return { catalog, log: { schema: 1, events } };
}

/** Inputs cover every legacy mode and multiple cold anchors.
 * @param {import('../src/bank/types.js').Catalog} catalog
 * @param {import('../src/bank/types.js').Attempt[]} records
 * @returns {Parameters<import('../src/bank/select.js').selectPuzzle>[0][]} */
export function equivalenceCases(catalog, records) {
  return /** @type {const} */ ([1, 4, 8]).flatMap((level) =>
    /** @type {const} */ (["easy", "medium", "hard", "manual"]).flatMap((mode) =>
      [0, "repeatable"].map((seed) => ({
        catalog,
        records,
        playerId: "player",
        mode,
        level,
        coldStart: { kind: "level", level },
        seed,
      }))
    )
  );
}
