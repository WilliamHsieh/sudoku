import { describe, expect, it } from "vitest";
import { deriveAbility, setColdStart } from "./ability.js";
import { CALIBRATION } from "./calibration.js";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { attempt, catalogWith, puzzle } from "./test-fixtures.js";

const catalog = (await openCatalog(catalogWith(Array.from({ length: 82 }, (_, i) => i + 10))))
  .catalog;
const base = { catalog, playerId: "player", seed: "cold" };
const modes = /** @type {const} */ (["easy", "medium", "hard"]);

describe("per-mode cold-start defaults", () => {
  it.each([
    { mode: "easy", level: 1, min: 10, max: 12 },
    { mode: "medium", level: 2, min: 26, max: 29 },
    { mode: "hard", level: 3, min: 35, max: 38 },
  ])("starts fresh $mode at L$level with rating tenths $min..$max", ({ mode, level, min, max }) => {
    const result = selectPuzzle({ ...base, mode: /** @type {import('./types.js').Mode} */ (mode) });
    expect(result.status).toBe("selected");
    expect(result.candidateRange).toEqual({ min, max });
    expect(result.context.coldStart).toEqual({ kind: "level", level });
    expect(result.reason.codes).toContain("provisional_anchor");
    expect(result.selectedRatingBucket).toBeGreaterThanOrEqual(min);
    expect(result.selectedRatingBucket).toBeLessThanOrEqual(max);
    expect(CALIBRATION.coldStartLevels[mode]).toBe(level);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "keeps explicit level and experience overrides compatible at L%i",
    (value) => {
      const level = /** @type {import('./types.js').Level} */ (value);
      for (const coldStart of [
        setColdStart({ kind: "level", level }),
        setColdStart({ kind: "experience", mapsToLevel: level }),
      ]) {
        const ability = deriveAbility({ ...base, coldStart });
        for (const mode of modes) {
          const result = selectPuzzle({ ...base, mode, coldStart });
          expect(result.candidateRange).toEqual(ability.bands[mode]);
          expect(result.context.coldStart).toEqual(coldStart);
          // Existing formulas produce nonempty bands even in narrow levels and L8.
          expect(result.candidateRange.min).toBeGreaterThanOrEqual(10);
          expect(result.candidateRange.max).toBeGreaterThanOrEqual(result.candidateRange.min);
          expect(Number.isFinite(result.candidateRange.max)).toBe(true);
        }
      }
    }
  );

  it("clamps the Hard formula to narrow L6's upper rating", () => {
    const result = selectPuzzle({
      ...base,
      mode: "hard",
      coldStart: setColdStart({ kind: "level", level: 6 }),
    });
    expect(result.candidateRange).toEqual({ min: 68, max: 69 });
    expect(result.selectedRatingBucket).toBeLessThanOrEqual(69);
  });

  /** @param {import('./types.js').Mode} mode @param {number[]} ratings @param {number} offset
   * @param {import('./types.js').Feedback} [feedback] */
  const solves = (mode, ratings, offset, feedback) =>
    ratings.map((rating, i) =>
      attempt(offset + i, { mode, puzzle: puzzle(offset + i, rating) }, "complete", feedback)
    );
  // Several L1 solves in every mode, including Hard finishes that the L1 rules would promote.
  const l1History = [
    ...solves("easy", [10, 11, 12, 10, 11], 100, "light"),
    ...solves("medium", [11, 12, 13], 110, "some_effort"),
    ...solves("hard", [14, 15, 16, 15, 16], 120),
  ];

  it.each([
    { mode: "easy", level: 1, min: 10, max: 12 },
    { mode: "medium", level: 2, min: 26, max: 29 },
    { mode: "hard", level: 3, min: 35, max: 38 },
  ])("still starts $mode at L$level after several L1 solves", ({ mode, level, min, max }) => {
    const m = /** @type {import('./types.js').Mode} */ (mode);
    expect(deriveAbility({ ...base, records: l1History }).evidenceCount).toBe(13);
    const result = selectPuzzle({ ...base, records: l1History, mode: m });
    expect(result.status).toBe("selected");
    expect(result.context.coldStart).toEqual({ kind: "level", level });
    expect(result.candidateRange).toEqual({ min, max });
    expect(result.selectedRatingBucket).toBeGreaterThanOrEqual(min);
    expect(result.selectedRatingBucket).toBeLessThanOrEqual(max);
    if (result.status === "selected") expect(result.puzzle.level).toBe(level);
    // Same as asking for that mode's anchor explicitly.
    expect(result).toEqual(
      selectPuzzle({
        ...base,
        records: l1History,
        mode: m,
        coldStart: setColdStart({
          kind: "level",
          level: /** @type {import('./types.js').Level} */ (level),
        }),
      })
    );
  });

  it("moves Hard up from its L3 start after strong Hard results", () => {
    const records = [...l1History, ...solves("hard", [36, 37, 38, 36, 37], 140)];
    const result = selectPuzzle({ ...base, records, mode: "hard" });
    expect(result.status).toBe("selected");
    expect(result.context.coldStart).toEqual({ kind: "level", level: 3 });
    expect(result.reason.codes).toContain("personalized_range");
    expect(result.candidateRange).toEqual({ min: 36, max: 39 });
    expect(result.selectedRatingBucket).toBeGreaterThanOrEqual(36);
  });

  it("moves Medium up from its L2 start after light Medium results", () => {
    const records = [...l1History, ...solves("medium", [27, 28, 29, 27, 28], 140, "light")];
    const result = selectPuzzle({ ...base, records, mode: "medium" });
    expect(result.status).toBe("selected");
    expect(result.context.coldStart).toEqual({ kind: "level", level: 2 });
    expect(result.reason.codes).toContain("personalized_range");
    expect(result.candidateRange).toEqual({ min: 26, max: 30 });
  });

  it("keeps explicit cold starts and their learned bands unchanged after promotion", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      attempt(100 + i, { mode: "hard", puzzle: puzzle(100 + i, 15) })
    );
    const coldStart = setColdStart({ kind: "level", level: 1 });
    const ability = deriveAbility({ ...base, records, coldStart });
    expect(ability.provisional).toBe(false);
    for (const mode of modes) {
      const result = selectPuzzle({ ...base, records, mode, coldStart });
      expect(result.candidateRange).toEqual(ability.bands[mode]);
      expect(result.context.coldStart).toEqual(coldStart);
    }
  });

  it("ignores other-player, replay, and unrated legacy history when choosing defaults", () => {
    const records = [
      attempt(100, { playerId: "other", puzzle: puzzle(100, 35) }),
      attempt(101, { replay: true, puzzle: puzzle(101, 35) }),
      { ...attempt(102), puzzle: undefined },
    ];
    expect(deriveAbility({ ...base, records }).evidenceCount).toBe(0);
    for (const mode of modes)
      expect(selectPuzzle({ ...base, records, mode }).candidateRange).toEqual(
        selectPuzzle({ ...base, mode }).candidateRange
      );
  });

  it("keeps lower fallback and maxOpenLevel rules for the new default ranges", async () => {
    const sparse = (await openCatalog(catalogWith([10, 13, 16]))).catalog;
    const result = selectPuzzle({ ...base, catalog: sparse, mode: "medium" });
    expect(result.status).toBe("selected");
    expect(result.fallbackUsed).toBe(true);
    expect(result.candidateRange).toEqual({ min: 10, max: 16 });
    const locked = selectPuzzle({ ...base, mode: "hard", maxOpenLevel: 2 });
    expect(locked.status).toBe("exhausted_in_range");
    expect(locked).not.toHaveProperty("fallbackPuzzle");
  });
});
