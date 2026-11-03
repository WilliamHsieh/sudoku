import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";
import { CHAIN_TECHNIQUES, detectChain } from "./engine-chains.js";

const values = () => Array(81).fill(0);
const candidates = () => Array(81).fill(ALL_DIGITS);
const pair = digitsMask([1, 2]);

describe("clean-room wing and colouring detectors", () => {
  it("never fabricates a pattern on an unrestricted board", () => {
    for (const id of CHAIN_TECHNIQUES) expect(detectChain(values(), candidates(), id)).toBeNull();
  });
  it("finds XY-Wing only with the correct shared non-pivot digit", () => {
    const masks = candidates();
    masks[0] = pair;
    masks[3] = digitsMask([1, 3]);
    masks[27] = digitsMask([2, 3]);
    const hint = detectChain(values(), masks, "xy-wing");
    expect(hint?.eliminations).toContainEqual({ cell: 30, digit: 3 });
    expect(hint?.premiseCells).toEqual([0, 3, 27]);
    masks[27] |= bit(4);
    expect(detectChain(values(), masks, "xy-wing")).toBeNull();
  });
  it("XYZ-Wing target must also see the three-candidate pivot", () => {
    const masks = candidates();
    masks[0] = digitsMask([1, 2, 3]);
    masks[1] = digitsMask([1, 3]);
    masks[9] = digitsMask([2, 3]);
    const hint = detectChain(values(), masks, "xyz-wing");
    expect(hint?.eliminations).toContainEqual({ cell: 10, digit: 3 });
    expect(hint?.eliminations.some((e) => e.cell === 28)).toBe(false);
    masks[0] |= bit(4);
    expect(detectChain(values(), masks, "xyz-wing")).toBeNull();
  });
  it("W-Wing requires an exact two-position strong link", () => {
    const masks = candidates();
    masks[0] = pair;
    masks[40] = pair;
    for (let c = 9; c < 18; c++) if (![9, 13].includes(c)) masks[c] &= ~bit(1);
    expect(detectChain(values(), masks, "w-wing")?.eliminations).toContainEqual({
      cell: 4,
      digit: 2,
    });
    masks[10] |= bit(1);
    expect(detectChain(values(), masks, "w-wing")).toBeNull();
  });
  it("Chute Remote Pair uses the absent third-line candidates, not a generic pair chain", () => {
    const masks = candidates();
    masks[3] = pair;
    masks[15] = pair;
    for (const c of [18, 19, 20]) masks[c] &= ~pair;
    const hint = detectChain(values(), masks, "chute-remote-pair");
    expect(hint?.eliminations).toContainEqual({ cell: 6, digit: 1 });
    expect(hint?.eliminations).toContainEqual({ cell: 6, digit: 2 });
    // r1c5 sees the first endpoint but not the second: canonical either-end bonus.
    expect(hint?.eliminations).toContainEqual({ cell: 4, digit: 1 });
    expect(hint?.eliminations).toContainEqual({ cell: 4, digit: 2 });
    masks[18] |= bit(1);
    const single = detectChain(values(), masks, "chute-remote-pair");
    expect(single?.eliminations).toContainEqual({ cell: 6, digit: 1 });
    expect(single?.eliminations.every((e) => e.digit === 1)).toBe(true);
    masks[18] |= bit(2);
    expect(detectChain(values(), masks, "chute-remote-pair")).toBeNull();
  });
  it("transposes Chute Remote Pair correctly", () => {
    const masks = candidates();
    masks[3] = pair;
    masks[15] = pair;
    for (const c of [18, 19, 20]) masks[c] &= ~pair;
    const transpose = (c) => (c % 9) * 9 + Math.floor(c / 9);
    const rotated = candidates();
    masks.forEach((m, c) => {
      rotated[transpose(c)] = m;
    });
    expect(detectChain(values(), rotated, "chute-remote-pair")?.eliminations).toContainEqual({
      cell: transpose(6),
      digit: 1,
    });
  });
  it("simple colouring finds a trap through exact strong links", () => {
    const masks = candidates();
    for (let c = 0; c < 9; c++) if (![0, 3].includes(c)) masks[c] &= ~bit(1);
    for (let c = 27; c < 36; c++) if (![27, 30].includes(c)) masks[c] &= ~bit(1);
    for (let c = 3; c < 81; c += 9) if (![3, 30].includes(c)) masks[c] &= ~bit(1);
    expect(detectChain(values(), masks, "simple-colouring")?.eliminations).toContainEqual({
      cell: 9,
      digit: 1,
    });
  });
  it("does not mutate supplied candidates", () => {
    const masks = candidates();
    masks[0] = pair;
    masks[3] = digitsMask([1, 3]);
    masks[27] = digitsMask([2, 3]);
    const original = [...masks];
    for (const id of CHAIN_TECHNIQUES) detectChain(values(), masks, id);
    expect(masks).toEqual(original);
  });
  it("never removes a preserved solution across seeded candidate perturbations", () => {
    // Synthetic constrained models, not a provenance corpus or a latency benchmark.
    let seed = 0x51af233;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const solution = Array.from(
      { length: 81 },
      (_, c) => ((Math.floor(c / 9) * 3 + Math.floor(Math.floor(c / 9) / 3) + (c % 9)) % 9) + 1
    );
    const found = new Set();
    for (let sample = 0; sample < 300; sample++) {
      const masks = solution.map((d) => {
        let mask = bit(d);
        for (let n = 1; n <= 9; n++) if (random() < 0.2) mask |= bit(n);
        return mask;
      });
      for (const id of CHAIN_TECHNIQUES) {
        const hint = detectChain(values(), masks, id);
        if (!hint) continue;
        found.add(id);
        for (const e of hint.eliminations)
          expect(e.digit, `${id} sample ${sample} cell ${e.cell}`).not.toBe(solution[e.cell]);
      }
    }
    expect(found.size).toBe(5);
  });
});
