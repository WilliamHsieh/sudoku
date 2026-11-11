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

  it("stops applying defaults after any ability evidence, even before a promotion", () => {
    const records = [attempt(100, { puzzle: puzzle(100, 35) })];
    const ability = deriveAbility({ ...base, records });
    expect(ability.evidenceCount).toBe(1);
    expect(ability.provisional).toBe(true);
    for (const mode of modes) {
      const result = selectPuzzle({ ...base, records, mode });
      expect(result.candidateRange).toEqual(ability.bands[mode]);
      expect(result).toEqual(
        selectPuzzle({
          ...base,
          records,
          mode,
          coldStart: setColdStart({ kind: "level", level: 1 }),
        })
      );
    }
  });

  it("leaves learned bands and selections unchanged after promotion", () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      attempt(100 + i, { mode: "hard", puzzle: puzzle(100 + i, 15) })
    );
    expect(deriveAbility({ ...base, records }).provisional).toBe(false);
    for (const mode of modes) {
      expect(selectPuzzle({ ...base, records, mode })).toEqual(
        selectPuzzle({
          ...base,
          records,
          mode,
          coldStart: setColdStart({ kind: "level", level: 1 }),
        })
      );
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
