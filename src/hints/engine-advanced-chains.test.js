import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";
import { CHAIN_TECHNIQUES, detectAdvancedChain } from "./engine-advanced-chains.js";
import { assertOracleStep, exactCover } from "./phase-three-oracle.mjs";
import corpus from "./fixtures/phase-three-corpus.json";

const values = () => Array(81).fill(0);
const candidates = () => Array(81).fill(ALL_DIGITS);
const visible = (cell, digit) =>
  Array.from({ length: 81 }, (_, c) => (c === cell ? bit(digit) : 0));
const restrict = (masks, unit, digit, positions) => {
  for (const cell of unit) if (!positions.includes(cell)) masks[cell] &= ~bit(digit);
};
const row = (n) => Array.from({ length: 9 }, (_, c) => n * 9 + c);
const col = (n) => Array.from({ length: 9 }, (_, r) => r * 9 + n);
const cycle = () => {
  const masks = candidates();
  restrict(masks, row(0), 1, [0, 3]);
  restrict(masks, row(3), 1, [27, 30]);
  return masks;
};
const xy = () => {
  const masks = candidates();
  masks[0] = digitsMask([1, 2]);
  masks[3] = digitsMask([2, 3]);
  masks[30] = digitsMask([3, 4]);
  masks[27] = digitsMask([4, 1]);
  return masks;
};
const grouped = () => {
  const masks = candidates();
  restrict(masks, row(0), 1, [0, 1, 3]);
  restrict(masks, row(1), 1, [9, 10, 12]);
  return masks;
};
const medusa = () => {
  const masks = candidates();
  masks[0] = digitsMask([1, 2]);
  masks[3] = digitsMask([2, 3]);
  masks[30] = digitsMask([3, 1]);
  restrict(masks, row(0), 2, [0, 3]);
  restrict(masks, col(3), 3, [3, 30]);
  return masks;
};
const inference = () => {
  const masks = candidates();
  masks[0] = digitsMask([1, 2]);
  restrict(masks, col(3), 2, [3, 30]);
  restrict(masks, row(3), 3, [27, 30]);
  return masks;
};
/** @type {[string, () => number[], number, number][]} */
const fixtures = [
  ["x-cycles", cycle, 9, 1],
  ["xy-chain", xy, 9, 1],
  ["3d-medusa", medusa, 27, 1],
  ["grouped-x-cycles", grouped, 18, 1],
  ["aic", inference, 27, 1],
];

describe("bounded advanced chain patterns", () => {
  it("does not invent links on an unrestricted board", () => {
    for (const id of CHAIN_TECHNIQUES)
      expect(detectAdvancedChain(values(), candidates(), id)).toBeNull();
  });

  for (const [id, setup, cell, digit] of fixtures) {
    it(`${id}: exact visible deduction with an independent all-completions proof`, () => {
      const masks = setup();
      const hint = detectAdvancedChain(values(), masks, id, visible(cell, digit));
      expect(hint?.techniqueId).toBe(id);
      expect(hint?.placements).toEqual([]);
      expect(hint?.eliminations).toEqual([{ cell, digit }]);
      expect(hint?.reason).toMatch(/強|候選鏈/);
      expect(assertOracleStep(values(), masks, hint).effects).toBe(1);
      expect(exactCover(values(), masks, { maxSolutions: 2 }).solutions).toHaveLength(2);
    });

    it(`${id}: hidden effects never become assumptions, and inputs stay untouched`, () => {
      const masks = setup(),
        original = [...masks];
      expect(detectAdvancedChain(values(), masks, id, Array(81).fill(0))).toBeNull();
      expect(detectAdvancedChain(values(), masks, id, visible(cell, digit))?.eliminations).toEqual([
        { cell, digit },
      ]);
      expect(masks).toEqual(original);
      const absent = Array(81).fill(0);
      const absentCell = masks.findIndex((mask) => !(mask & bit(9)));
      if (absentCell >= 0) absent[absentCell] = bit(9);
      expect(detectAdvancedChain(values(), masks, id, absent)).toBeNull();
    });
  }

  it("X-Cycles also closes a genuine weak-link discontinuity", () => {
    const masks = candidates();
    restrict(masks, row(0), 1, [0, 3]);
    restrict(masks, row(3), 1, [29, 30]);
    const hint = detectAdvancedChain(values(), masks, "x-cycles", visible(11, 1));
    expect(hint?.eliminations).toEqual([{ cell: 11, digit: 1 }]);
    expect(hint?.reason).toContain("兩條弱連結");
    expect(assertOracleStep(values(), masks, hint).effects).toBe(1);
  });

  it("X-Cycles stops when an exact strong link gains a third position", () => {
    const masks = cycle();
    masks[1] |= bit(1);
    expect(detectAdvancedChain(values(), masks, "x-cycles", visible(9, 1))).toBeNull();
  });

  it("XY-Chain needs each bivalue link and both endpoints visible to the target", () => {
    const masks = xy();
    expect(detectAdvancedChain(values(), masks, "xy-chain", visible(12, 1))).toBeNull();
    masks[30] |= bit(5);
    expect(detectAdvancedChain(values(), masks, "xy-chain", visible(9, 1))).toBeNull();
  });

  it("does not relabel a three-cell XY-Wing as the implemented XY-Chain", () => {
    const masks = candidates();
    masks[0] = digitsMask([1, 2]);
    masks[3] = digitsMask([1, 3]);
    masks[27] = digitsMask([2, 3]);
    expect(detectAdvancedChain(values(), masks, "xy-chain")).toBeNull();
  });

  it("3D Medusa needs the cross-digit strong component, not disconnected colours", () => {
    const masks = medusa();
    masks[1] |= bit(2);
    expect(detectAdvancedChain(values(), masks, "3d-medusa", visible(27, 1))).toBeNull();
    expect(detectAdvancedChain(values(), cycle(), "3d-medusa")).toBeNull();
  });

  it("grouped X-Cycles needs every group member, an exact partition, and a real group", () => {
    const masks = grouped();
    expect(detectAdvancedChain(values(), masks, "x-cycles", visible(18, 1))).toBeNull();
    expect(detectAdvancedChain(values(), masks, "grouped-x-cycles", visible(27, 1))).toBeNull();
    masks[6] |= bit(1);
    expect(detectAdvancedChain(values(), masks, "grouped-x-cycles", visible(18, 1))).toBeNull();
    expect(detectAdvancedChain(values(), xy(), "grouped-x-cycles", visible(9, 1))).toBeNull();
  });

  it("AIC requires a mixed chain and exact house strong links", () => {
    const masks = inference();
    const hint = detectAdvancedChain(values(), masks, "aic", visible(27, 1));
    expect(hint?.premiseCells).toEqual([0, 3, 30, 27]);
    masks[12] |= bit(2);
    expect(detectAdvancedChain(values(), masks, "aic", visible(27, 1))).toBeNull();
    expect(detectAdvancedChain(values(), cycle(), "aic")).toBeNull();
  });

  for (const [id, setup, cell, digit] of fixtures) {
    it(`${id}: preserves the pattern under transposition and digit relabelling`, () => {
      const transpose = (c) => (c % 9) * 9 + Math.floor(c / 9);
      const masks = candidates();
      setup().forEach((mask, c) => {
        masks[transpose(c)] = 0;
        for (let d = 1; d <= 9; d++) if (mask & bit(d)) masks[transpose(c)] |= bit(10 - d);
      });
      const hint = detectAdvancedChain(values(), masks, id, visible(transpose(cell), 10 - digit));
      expect(hint?.eliminations).toEqual([{ cell: transpose(cell), digit: 10 - digit }]);
      expect(assertOracleStep(values(), masks, hint).effects).toBe(1);
    });

    it(`${id}: searches past a complete first pattern whose effects are hidden`, () => {
      const fixtureId = id.includes("x-cycles")
        ? "upstream-example:SASHIMI_X_WING"
        : "upstream-example:WXYZ_WING";
      const fixture = corpus.fixtures.find((f) => f.id === fixtureId);
      const board = [...fixture.values].map(Number),
        masks = [...fixture.masks];
      const first = detectAdvancedChain(board, masks, id);
      expect(first).not.toBeNull();
      const effects = [...masks];
      for (const effect of first.eliminations) effects[effect.cell] &= ~bit(effect.digit);
      const next = detectAdvancedChain(board, masks, id, effects);
      expect(next).not.toBeNull();
      for (const effect of next.eliminations) {
        expect(first.eliminations).not.toContainEqual(effect);
        expect(effects[effect.cell] & masks[effect.cell] & bit(effect.digit)).not.toBe(0);
      }
      expect(() => assertOracleStep(board, masks, next)).not.toThrow();
    });
  }

  it("3D Medusa removes a colour that repeats one digit in visible peers", () => {
    const masks = medusa();
    restrict(masks, row(3), 1, [27, 30]);
    const hint = detectAdvancedChain(values(), masks, "3d-medusa", visible(0, 1));
    expect(hint?.eliminations).toEqual([{ cell: 0, digit: 1 }]);
    expect(hint?.reason).toContain("這一色的候選全部可刪除");
    expect(assertOracleStep(values(), masks, hint).effects).toBe(1);
    masks[28] |= bit(1);
    expect(detectAdvancedChain(values(), masks, "3d-medusa", visible(0, 1))).toBeNull();
  });

  it("3D Medusa removes a colour containing two different candidates in one cell", () => {
    const masks = medusa();
    restrict(masks, col(0), 1, [0, 27]);
    restrict(masks, row(3), 3, [27, 30]);
    const hint = detectAdvancedChain(values(), masks, "3d-medusa", visible(0, 2));
    expect(hint?.eliminations).toEqual([{ cell: 0, digit: 2 }]);
    expect(hint?.reason).toContain("這一色的候選全部可刪除");
    expect(assertOracleStep(values(), masks, hint).effects).toBe(1);
  });

  it("never eliminates a preserved solution across seeded candidate perturbations", () => {
    let seed = 0x4c494e4b;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const solution = Array.from(
      { length: 81 },
      (_, c) => ((Math.floor(c / 9) * 3 + Math.floor(Math.floor(c / 9) / 3) + (c % 9)) % 9) + 1
    );
    const found = new Set();
    for (let sample = 0; sample < 80; sample++) {
      const masks = solution.map((digit) => {
        let mask = bit(digit);
        for (let d = 1; d <= 9; d++) if (random() < 0.24) mask |= bit(d);
        return mask;
      });
      for (const id of CHAIN_TECHNIQUES) {
        const hint = detectAdvancedChain(values(), masks, id);
        if (!hint) continue;
        found.add(id);
        for (const effect of hint.eliminations)
          expect(effect.digit, `${id} sample ${sample} cell ${effect.cell}`).not.toBe(
            solution[effect.cell]
          );
      }
    }
    expect(found.size).toBe(5);
  });

  it("validates input dimensions and ignores unsupported technique IDs", () => {
    expect(() => detectAdvancedChain([], candidates(), "aic")).toThrow(TypeError);
    expect(() => detectAdvancedChain(values(), candidates(), "aic", [])).toThrow(TypeError);
    expect(detectAdvancedChain(values(), candidates(), "forcing-net")).toBeNull();
  });
});
