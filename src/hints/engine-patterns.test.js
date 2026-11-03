import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";
import { detectPattern, PATTERN_TECHNIQUES } from "./engine-patterns.js";
const zeros = () => Array(81).fill(0);
const all = () => Array(81).fill(ALL_DIGITS);
const effect = (cell, digit) => ({ cell, digit });

describe("direct pattern detectors", () => {
  it("rejects unknown names and invalid masks rather than guessing", () => {
    expect(() => detectPattern(zeros(), all(), "guess")).toThrow();
    expect(() => detectPattern(zeros(), Array(81).fill(1), "naked-single")).toThrow();
  });
  it("returns no result for an unrestricted candidate board for every exact ID", () => {
    for (const id of PATTERN_TECHNIQUES) expect(detectPattern(zeros(), all(), id)).toBeNull();
  });
  it("finds naked single without relying on notes", () => {
    const masks = all();
    masks[12] = bit(7);
    expect(detectPattern(zeros(), masks, "naked-single")?.placements).toEqual([effect(12, 7)]);
  });
  it("finds full house from eight filled peers", () => {
    const values = zeros();
    const masks = all();
    for (let c = 0; c < 8; c++) {
      values[c] = c + 1;
      masks[c] = 0;
    }
    masks[8] = bit(9);
    expect(detectPattern(values, masks, "full-house")?.placements).toEqual([effect(8, 9)]);
  });
  it("finds hidden single across complete unit positions", () => {
    const masks = all();
    for (let c = 0; c < 8; c++) masks[c] &= ~bit(9);
    expect(detectPattern(zeros(), masks, "hidden-single")?.placements).toEqual([effect(8, 9)]);
  });
  for (const [name, n] of [
    ["pair", 2],
    ["triple", 3],
    ["quad", 4],
  ]) {
    it(`finds naked ${name} and does not eliminate from premises`, () => {
      const masks = all();
      const digits = Array.from({ length: Number(n) }, (_, i) => i + 1);
      for (let c = 0; c < Number(n); c++) masks[c] = digitsMask(digits);
      const step = detectPattern(zeros(), masks, `naked-${name}`);
      expect(step).not.toBeNull();
      expect(step?.eliminations).toContainEqual(effect(Number(n), 1));
      expect(step?.eliminations.some((p) => p.cell < Number(n))).toBe(false);
    });
    it(`finds hidden ${name} using all occurrences in the unit`, () => {
      const masks = all();
      const chosen = digitsMask(Array.from({ length: Number(n) }, (_, i) => i + 1));
      for (let c = Number(n); c < 9; c++) masks[c] &= ~chosen;
      const step = detectPattern(zeros(), masks, `hidden-${name}`);
      expect(step?.eliminations).toContainEqual(effect(0, 9));
      expect(step?.eliminations.some((p) => p.digit <= Number(n))).toBe(false);
    });
  }
  it("distinguishes pointing and claiming source direction", () => {
    const pointing = all();
    for (const c of [9, 10, 11, 18, 19, 20]) pointing[c] &= ~bit(5);
    expect(detectPattern(zeros(), pointing, "pointing")?.eliminations).toContainEqual(effect(3, 5));
    const claiming = all();
    for (let c = 3; c < 9; c++) claiming[c] &= ~bit(5);
    expect(detectPattern(zeros(), claiming, "box-line")?.eliminations).toContainEqual(effect(9, 5));
  });
  for (const [id, n] of [
    ["x-wing", 2],
    ["swordfish", 3],
    ["jellyfish", 4],
  ]) {
    for (const transpose of [false, true])
      it(`finds ${id} in ${transpose ? "column" : "row"} orientation`, () => {
        const masks = all();
        const size = Number(n);
        const at = (r, c) => (transpose ? c * 9 + r : r * 9 + c);
        for (let r = 0; r < size; r++) for (let c = size; c < 9; c++) masks[at(r, c)] &= ~bit(7);
        const step = detectPattern(zeros(), masks, String(id));
        expect(step?.eliminations).toContainEqual(effect(at(size, 0), 7));
        expect(
          step?.eliminations.some((p) =>
            transpose ? p.cell % 9 < size : Math.floor(p.cell / 9) < size
          )
        ).toBe(false);
      });
  }
  for (const [id, n] of [
    ["finned-x-wing", 2],
    ["finned-swordfish", 3],
  ]) {
    it(`finds ${id} only in fin-visible cover cells`, () => {
      const masks = all();
      const size = Number(n);
      const bases = size === 2 ? [0, 3] : [0, 3, 6];
      const covers = size === 2 ? [0, 4] : [0, 4, 7];
      for (const r of bases)
        for (let c = 0; c < 9; c++) if (!covers.includes(c)) masks[r * 9 + c] &= ~bit(7);
      masks[1] |= bit(7); // fin at r1c2, targets r2c1 and r3c1
      const step = detectPattern(zeros(), masks, String(id));
      expect(step?.eliminations).toContainEqual(effect(9, 7));
      expect(step?.eliminations.every((p) => [9, 18].includes(p.cell))).toBe(true);
    });
  }
  it("does not mislabel a sashimi rectangle as finned X-Wing", () => {
    const masks = all();
    for (const r of [0, 3]) for (let c = 0; c < 9; c++) masks[r * 9 + c] &= ~bit(7);
    for (const c of [0, 1, 27, 31]) masks[c] |= bit(7);
    expect(detectPattern(zeros(), masks, "finned-x-wing")).toBeNull();
  });
});

it("preserves a known completion across 64 seeded sound candidate states", () => {
  // These are mathematical pattern stress states, not provenance-validated
  // gameplay/benchmark fixtures. Keeping one completion is not exhaustive proof.
  let seed = 830016;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < 64; k++) {
    const solution = Array.from(
      { length: 81 },
      (_, i) => ((Math.floor(i / 9) * 3 + Math.floor(Math.floor(i / 9) / 3) + (i % 9)) % 9) + 1
    );
    const values = solution.map((d) => (random() < 0.2 ? d : 0));
    const masks = values.map((value, cell) => {
      if (value) return 0;
      let mask = ALL_DIGITS;
      for (let peer = 0; peer < 81; peer++) {
        if (
          Math.floor(peer / 9) === Math.floor(cell / 9) ||
          peer % 9 === cell % 9 ||
          (Math.floor(Math.floor(peer / 9) / 3) === Math.floor(Math.floor(cell / 9) / 3) &&
            Math.floor((peer % 9) / 3) === Math.floor((cell % 9) / 3))
        ) {
          if (values[peer]) mask &= ~bit(values[peer]);
        }
      }
      for (let digit = 1; digit <= 9; digit++)
        if (digit !== solution[cell] && random() < 0.25) mask &= ~bit(digit);
      return mask;
    });
    for (const id of PATTERN_TECHNIQUES) {
      const step = detectPattern(values, masks, id);
      for (const { cell, digit } of step?.placements ?? []) expect(digit, id).toBe(solution[cell]);
      for (const { cell, digit } of step?.eliminations ?? [])
        expect(digit, id).not.toBe(solution[cell]);
    }
  }
}, 15000);
