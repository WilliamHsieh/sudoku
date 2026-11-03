import { describe, expect, it } from "vitest";
import { ADVANCED_PATTERN_TECHNIQUES, detectAdvancedPattern } from "./engine-advanced-patterns.js";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";

const values = () => Array(81).fill(0);
const candidates = () => Array(81).fill(ALL_DIGITS);
const detect = (masks, id, visible = masks) => detectAdvancedPattern(values(), masks, id, visible);
const rectangle = () => {
  const masks = candidates();
  for (let cell = 0; cell < 9; cell++) if (![0, 3].includes(cell)) masks[cell] &= ~bit(1);
  for (const cell of [30, 31, 32, 39, 40, 41, 48, 49, 50])
    if (![31, 39].includes(cell)) masks[cell] &= ~bit(1);
  return masks;
};
const wing = () => {
  const masks = candidates();
  masks[0] = digitsMask([1, 2, 3, 4]);
  masks[1] = digitsMask([1, 4]);
  masks[3] = digitsMask([2, 4]);
  masks[9] = digitsMask([3, 4]);
  return masks;
};

describe("phase-three direct patterns", () => {
  it("finds the standard rectangle without assuming uniqueness", () => {
    const masks = rectangle();
    const step = detect(masks, "rectangle-elimination");
    expect(step?.eliminations).toContainEqual({ cell: 27, digit: 1 });
    expect(step?.premiseCells).toEqual([0, 3, 31, 39]);
    // A candidate escaping both arms breaks the fourth-box contradiction.
    masks[50] |= bit(1);
    expect(detect(masks, "rectangle-elimination")).toBeNull();
  });
  it("transposes rectangle hinges correctly", () => {
    const transpose = (cell) => (cell % 9) * 9 + Math.floor(cell / 9);
    const masks = candidates();
    rectangle().forEach((mask, cell) => (masks[transpose(cell)] = mask));
    expect(detect(masks, "rectangle-elimination")?.eliminations).toContainEqual({
      cell: transpose(27),
      digit: 1,
    });
  });
  it("finds four-cell WXYZ-Wing with exactly one unrestricted digit", () => {
    const masks = wing();
    const step = detect(masks, "wxyz-wing");
    expect(step?.premiseCells).toEqual([0, 1, 3, 9]);
    expect(step?.eliminations).toContainEqual({ cell: 2, digit: 4 });
    expect(step?.eliminations.some((e) => e.cell === 12)).toBe(false);
    masks[9] |= bit(5);
    expect(detect(masks, "wxyz-wing")).toBeNull();
  });
  it("rejects WXYZ patterns with two unrestricted digits", () => {
    const masks = wing();
    masks[9] = digitsMask([2, 3, 4]);
    expect(detect(masks, "wxyz-wing")).toBeNull();
  });
  it("enumerates all aligned base assignments before excluding a candidate", () => {
    const masks = candidates();
    masks[0] = digitsMask([1, 2]);
    masks[1] = digitsMask([2, 3]);
    masks[3] = digitsMask([1, 3]);
    masks[9] = digitsMask([2, 3]);
    const visible = Array(81).fill(0);
    visible[1] = bit(3);
    expect(detect(masks, "aligned-pair-exclusion", visible)?.eliminations).toEqual([
      { cell: 1, digit: 3 },
    ]);
    masks[3] |= bit(4);
    expect(detect(masks, "aligned-pair-exclusion", visible)).toBeNull();
  });
  it("supports two-cell common-peer ALS witnesses", () => {
    const masks = candidates();
    masks[0] = digitsMask([1, 2]);
    masks[1] = digitsMask([2, 3]);
    masks[9] = digitsMask([1, 4]);
    masks[10] = digitsMask([3, 4]);
    masks[3] = digitsMask([2, 3]);
    const visible = Array(81).fill(0);
    visible[1] = bit(3);
    expect(detect(masks, "aligned-pair-exclusion", visible)?.eliminations).toEqual([
      { cell: 1, digit: 3 },
    ]);
    masks[10] |= bit(5);
    expect(detect(masks, "aligned-pair-exclusion", visible)).toBeNull();
  });
  it("filters every direct pattern to a visible effect without mutating masks", () => {
    /** @type {[string, number[], number, number][]} */
    const fixtures = [
      ["rectangle-elimination", rectangle(), 27, 1],
      ["wxyz-wing", wing(), 2, 4],
    ];
    for (const [id, masks, cell, digit] of fixtures) {
      const original = [...masks];
      expect(detect(masks, id, Array(81).fill(0))).toBeNull();
      const visible = Array(81).fill(0);
      visible[cell] = bit(digit);
      expect(detect(masks, id, visible)?.eliminations).toEqual([{ cell, digit }]);
      expect(masks).toEqual(original);
    }
  });
  it("returns no unsupported pattern on an unconstrained board", () => {
    for (const id of ADVANCED_PATTERN_TECHNIQUES) expect(detect(candidates(), id)).toBeNull();
  });
  it("does not eliminate a retained solution under deterministic perturbations", () => {
    let seed = 0x6754321;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const solution = Array.from(
      { length: 81 },
      (_, cell) =>
        ((Math.floor(cell / 9) * 3 + Math.floor(Math.floor(cell / 9) / 3) + (cell % 9)) % 9) + 1
    );
    for (let sample = 0; sample < 100; sample++) {
      const masks = solution.map((d) => {
        let mask = bit(d);
        for (let n = 1; n <= 9; n++) if (random() < 0.22) mask |= bit(n);
        return mask;
      });
      for (const id of ADVANCED_PATTERN_TECHNIQUES) {
        const step = detect(masks, id);
        for (const effect of step?.eliminations ?? [])
          expect(effect.digit, `${id}, sample ${sample}`).not.toBe(solution[effect.cell]);
      }
    }
  });
});
