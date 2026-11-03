import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";
import { ALS_TECHNIQUES, detectALS } from "./engine-als.js";
import { hasCompletion, verifyStep } from "./proof-verifier.js";

const values = () => Array(81).fill(0);
/** @param {Record<number, number[]>} entries */
function model(entries) {
  const masks = Array(81).fill(ALL_DIGITS);
  for (const [cell, ds] of Object.entries(entries)) masks[Number(cell)] = digitsMask(ds);
  return masks;
}
/** @param {{cell:number,digit:number}[]} effects */
function visible(effects) {
  const masks = Array(81).fill(0);
  for (const { cell, digit } of effects) masks[cell] |= bit(digit);
  return masks;
}

const fixtures = [
  {
    id: "als-xz",
    setup: () => model({ 0: [1, 2], 3: [2, 3], 27: [1, 4], 29: [3, 4] }),
    effects: [{ cell: 2, digit: 3 }],
    // The ALS cardinalities still hold, but not all 1s see each other.
    breakPattern: (masks) => {
      masks[3] |= bit(1);
    },
    minPremises: 4,
  },
  {
    id: "als-xy-wing",
    setup: () => model({ 0: [1, 2], 3: [1, 4], 4: [3, 4], 27: [2, 5], 28: [3, 5] }),
    effects: [{ cell: 31, digit: 3 }],
    breakPattern: (masks) => {
      masks[0] |= bit(6);
    },
    minPremises: 5,
  },
  {
    id: "death-blossom",
    // A genuine three-candidate stem. Its four-cell, one-cell, and three-cell
    // petals overlap; no disjoint-petal restriction is logically necessary.
    setup: () => model({ 59: [3, 6, 9], 65: [2, 6], 66: [5, 6], 67: [2, 9], 68: [3, 9] }),
    effects: [{ cell: 64, digit: 5 }],
    breakPattern: (masks) => {
      masks[59] |= bit(7);
    },
    minPremises: 5,
  },
  {
    id: "sue-de-coq",
    setup: () => model({ 0: [1, 2, 3, 4], 1: [1, 2, 3, 4], 3: [1, 2], 9: [3, 4] }),
    effects: [
      { cell: 4, digit: 1 },
      { cell: 10, digit: 3 },
    ],
    breakPattern: (masks) => {
      masks[9] |= bit(5);
    },
    minPremises: 4,
  },
];

describe("clean-room bounded ALS patterns", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: recognizes its named structure and proves every visible effect`, () => {
      const masks = fixture.setup();
      const hint = detectALS(values(), masks, fixture.id, visible(fixture.effects));
      expect(hint?.techniqueId).toBe(fixture.id);
      expect(hint?.eliminations).toEqual(fixture.effects);
      expect(hint?.premiseCells.length).toBeGreaterThanOrEqual(fixture.minPremises);
      expect(hint?.placements).toEqual([]);
      expect(hint?.reason).toMatch(/[候選主幹交集]/);
      expect(verifyStep(values(), masks, hint)).toBe(true);
    });

    it(`${fixture.id}: rejects a mutated premise, rather than guessing from the solution`, () => {
      const masks = fixture.setup();
      fixture.breakPattern(masks);
      expect(detectALS(values(), masks, fixture.id, visible(fixture.effects))).toBeNull();
      // Mutation genuinely destroys the deduction, not merely our recognition:
      // the former target is possible in at least one full Sudoku completion.
      const forced = [...masks];
      const effect = fixture.effects[0];
      forced[effect.cell] = bit(effect.digit);
      expect(hasCompletion(values(), forced)).toBe(true);
    });

    it(`${fixture.id}: does not turn hidden effects into candidate assumptions`, () => {
      const masks = fixture.setup();
      const board = values();
      Object.freeze(masks);
      Object.freeze(board);
      const hidden = Array(81).fill(0);
      expect(detectALS(board, masks, fixture.id, hidden)).toBeNull();
      // Only effect visibility changes. All premise masks remain complete.
      const targetOnly = visible([fixture.effects.at(-1)]);
      const before = [...masks];
      const hint = detectALS(board, masks, fixture.id, targetOnly);
      expect(hint?.eliminations).toEqual([fixture.effects.at(-1)]);
      expect(masks).toEqual(before);
      expect(targetOnly).toEqual(visible([fixture.effects.at(-1)]));
      // Visible notes cannot resurrect a candidate absent from the model.
      const absent = visible([{ cell: hint.premiseCells[0], digit: 9 }]);
      expect(detectALS(board, masks, fixture.id, absent)).toBeNull();
    });

    it(`${fixture.id}: remains sound after transposing and renaming digits`, () => {
      const transpose = (c) => (c % 9) * 9 + Math.floor(c / 9);
      const renamed = (d) => 10 - d;
      const masks = Array(81).fill(0);
      fixture.setup().forEach((m, c) => {
        for (let d = 1; d <= 9; d++) if (m & bit(d)) masks[transpose(c)] |= bit(renamed(d));
      });
      const expected = fixture.effects.map(({ cell, digit }) => ({
        cell: transpose(cell),
        digit: renamed(digit),
      }));
      const hint = detectALS(values(), masks, fixture.id, visible(expected));
      expect(hint?.eliminations).toEqual(expect.arrayContaining(expected));
      expect(verifyStep(values(), masks, hint)).toBe(true);
    });
  }

  it("ALS-XZ also uses two restricted links to lock non-common candidates", () => {
    const masks = model({ 0: [1, 2], 3: [2, 3], 27: [1, 4], 30: [3, 4] });
    const expected = [
      { cell: 6, digit: 2 },
      { cell: 33, digit: 4 },
    ];
    const hint = detectALS(values(), masks, "als-xz", visible(expected));
    expect(hint?.eliminations).toEqual(expected);
    expect(hint?.reason).toContain("兩組各用其中一數");
    expect(verifyStep(values(), masks, hint)).toBe(true);
  });

  it("continues past an ineffective ALS-XZ to find a later visible pattern", () => {
    const masks = fixtures[0].setup();
    masks[50] = digitsMask([6, 7]);
    masks[53] = digitsMask([7, 8]);
    masks[77] = digitsMask([6, 9]);
    masks[80] = digitsMask([8, 9]);
    const expected = [{ cell: 17, digit: 8 }];
    const hint = detectALS(values(), masks, "als-xz", visible(expected));
    expect(hint?.eliminations).toEqual(expected);
    expect(hint?.premiseCells).toEqual(expect.arrayContaining([50, 53, 77, 80]));
    expect(verifyStep(values(), masks, hint)).toBe(true);
  });

  it("Sue de Coq permits a shared external digit, but never a shared intersection digit", () => {
    const masks = model({
      0: [1, 2, 3, 4],
      1: [1, 2, 3, 4],
      3: [1, 5],
      4: [2, 5],
      9: [3, 5],
      10: [4, 5],
    });
    const expected = [
      { cell: 5, digit: 5 },
      { cell: 18, digit: 5 },
    ];
    const hint = detectALS(values(), masks, "sue-de-coq", visible(expected));
    expect(hint?.eliminations).toEqual(expected);
    expect(verifyStep(values(), masks, hint)).toBe(true);
    masks[1] |= bit(5);
    expect(detectALS(values(), masks, "sue-de-coq", visible(expected))).toBeNull();
  });

  it("Sue de Coq locks a leftover digit in a three-cell intersection in both houses", () => {
    const masks = model({
      0: [1, 2, 5],
      1: [1, 3, 5],
      2: [2, 4, 5],
      3: [1, 2],
      9: [3, 4],
    });
    const expected = [
      { cell: 4, digit: 5 },
      { cell: 10, digit: 5 },
    ];
    const hint = detectALS(values(), masks, "sue-de-coq", visible(expected));
    expect(hint?.eliminations).toEqual(expected);
    expect(hint?.premiseCells).toEqual(expect.arrayContaining([0, 1, 2, 3, 9]));
    expect(verifyStep(values(), masks, hint)).toBe(true);
  });

  it("does not fabricate patterns on an unrestricted grid or unknown technique", () => {
    for (const id of ALS_TECHNIQUES) expect(detectALS(values(), model({}), id)).toBeNull();
    expect(detectALS(values(), model({}), "not-an-als-technique")).toBeNull();
    expect(() => detectALS([], model({}), "als-xz")).toThrow(TypeError);
    expect(() => detectALS(values(), model({}), "als-xz", [])).toThrow(TypeError);
  });

  it("preserves a known completion across seeded candidate perturbations", () => {
    // Synthetic soundness checks, not an external provenance or speed corpus.
    let seed = 0xabc123;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const solution = values().map(
      (_, c) => ((Math.floor(c / 9) * 3 + Math.floor(Math.floor(c / 9) / 3) + (c % 9)) % 9) + 1
    );
    const found = new Set();
    for (let sample = 0; sample < 80; sample++) {
      const masks = solution.map((d) => {
        let mask = bit(d);
        for (let n = 1; n <= 9; n++) if (random() < 0.18) mask |= bit(n);
        return mask;
      });
      for (const id of ALS_TECHNIQUES) {
        const hint = detectALS(values(), masks, id);
        if (!hint) continue;
        found.add(id);
        for (const effect of hint.eliminations)
          expect(effect.digit, `${id}, sample ${sample}, cell ${effect.cell}`).not.toBe(
            solution[effect.cell]
          );
      }
    }
    expect([...found].sort()).toEqual([...ALS_TECHNIQUES].sort());
  });
});
