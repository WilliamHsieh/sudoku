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
      expect(hint?.reason).toContain("候選");
      expect(verifyStep(values(), masks, hint)).toBe(true);
    });

    it(`${fixture.id}: teaches observations, concrete cases, and the target conflict separately`, () => {
      const hint = detectALS(values(), fixture.setup(), fixture.id, visible(fixture.effects));
      const teaching = hint.teaching;
      expect(teaching.observeTitle).toBeTruthy();
      expect(teaching.reasonTitle).toBeTruthy();
      expect(teaching.observe.length).toBeGreaterThanOrEqual(2);
      expect(teaching.observe.length).toBeLessThanOrEqual(5);
      expect(teaching.reasoning.length).toBeGreaterThanOrEqual(2);
      expect(teaching.conclusion).toHaveLength(2);
      expect(hint.reason).toBe(
        [...teaching.observe, ...teaching.reasoning, ...teaching.conclusion].join("\n\n")
      );
      expect(hint.reason).not.toMatch(/近鎖定|鎖定|受限|RCC|主幹|花瓣|位置類別|null|undefined/);
      for (const cell of hint.premiseCells)
        expect(teaching.observe.join(" ")).toContain(
          `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`
        );
      for (const { cell, digit } of hint.eliminations) {
        expect(teaching.conclusion.join(" ")).toContain(
          `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`
        );
        expect(teaching.conclusion.join(" ")).toContain(`填 ${digit}`);
      }
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
    expect(hint?.teaching.reasoning[1]).toContain("如果第一組使用 1");
    expect(hint?.teaching.reasoning[1]).toContain("只剩 3、4，剛好 2 種數");
    expect(hint?.teaching.reasoning[2]).toContain("如果第一組使用 3");
    expect(hint?.teaching.reasoning[2]).toContain("只剩 1、4，剛好 2 種數");
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
    expect(hint.teaching.observe.join(" ")).toContain(
      "交集中的 1、2 也出現在前一組，3、4 也出現在後一組"
    );
    expect(hint.teaching.reasoning[3]).toContain("共 3 格只能用 1、2、5");
    expect(hint.teaching.reasoning[3]).toContain("把 3、4、5 每個數都用上");
    expect(hint.teaching.conclusion[0]).toContain("r1c4、r1c5 之中至少有一格必須填 5");
    expect(hint.teaching.conclusion[0]).toContain("r2c1、r2c2 之中至少有一格必須填 5");
    expect(hint.reason).not.toContain("5 只出現在交集");
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
    expect(hint.teaching.observe[3]).toContain("剩下的 5 只出現在交集，不在這兩組裡");
    expect(hint.teaching.reasoning[2]).toContain("再加上 5 各一個");
    expect(hint.teaching.reasoning[3]).toContain("5 必須出現在交集裡");
    expect(verifyStep(values(), masks, hint)).toBe(true);
  });

  it("explains both ALS-XZ cases and names the actual row/column conflicts at the target", () => {
    const fixture = fixtures[0];
    const { teaching } = detectALS(values(), fixture.setup(), fixture.id, visible(fixture.effects));
    expect(teaching.observe[2]).toContain("r1c1、r4c1");
    expect(teaching.observe[2]).toContain("第 1 直行");
    expect(teaching.reasoning[0]).toContain("如果第一組 r1c1、r1c4 使用 1");
    expect(teaching.reasoning[0]).toContain("只剩 3、4，剛好 2 種數");
    expect(teaching.reasoning[1]).toContain("完全沒有使用 1");
    expect(teaching.reasoning[1]).toContain("只剩 2、3，剛好 2 種數");
    expect(teaching.conclusion[1]).toContain("r1c3 和 r1c4 同在第 1 橫列");
    expect(teaching.conclusion[1]).toContain("和 r4c3 同在第 3 直行");
    expect(teaching.conclusion[1]).toContain("若填 3，就會讓上述位置全部失去 3");
  });

  it("explains the complete ALS-XY-Wing cause-and-effect sequence, not just a final implication", () => {
    const fixture = fixtures[1];
    const { teaching } = detectALS(values(), fixture.setup(), fixture.id, visible(fixture.effects));
    expect(teaching.observe[3]).toContain("第 1 橫列");
    expect(teaching.observe[4]).toContain("第 1 直行");
    expect(teaching.reasoning[0]).toContain("如果第一組 r1c4、r1c5 已經有 3");
    expect(teaching.reasoning[1]).toContain("只剩 1、4，剛好 2 種數");
    expect(teaching.reasoning[1]).toContain("中間組的 r1c1 不能填 1");
    expect(teaching.reasoning[2]).toContain("r1c1 只剩 2，因此必須填 2");
    expect(teaching.reasoning[2]).toContain("第三組的 r4c1 不能填 2");
    expect(teaching.reasoning[3]).toContain("只剩 3、5，剛好 2 種數");
  });

  it("gives each Death Blossom option its own paragraph and preserves overlapping groups", () => {
    const fixture = fixtures[2];
    const { teaching } = detectALS(values(), fixture.setup(), fixture.id, visible(fixture.effects));
    expect(teaching.observe[0]).toBe("r7c6 只有 3、6、9，最後一定填其中一個。");
    expect(teaching.reasoning).toHaveLength(3);
    expect(teaching.reasoning[0]).toContain("如果 r7c6 填 3");
    expect(teaching.reasoning[0]).toContain("只剩 2、5、6、9，剛好 4 種數");
    expect(teaching.reasoning[1]).toContain("如果 r7c6 填 6");
    expect(teaching.reasoning[1]).toContain("r8c4 只剩 5，因此必須填 5");
    expect(teaching.reasoning[2]).toContain("如果 r7c6 填 9");
    expect(teaching.reasoning[2]).toContain("只剩 2、5、6，剛好 3 種數");
    expect(teaching.conclusion[0]).toBe("因此，r8c4 必須填 5。");
    expect(teaching.conclusion[1]).toContain("r8c2 也在第 8 橫列，再填 5 就會重複");
  });

  it("describes an empty remaining set naturally in a one-cell double-linked case", () => {
    const masks = model({ 0: [1, 2], 3: [1, 3], 4: [2, 3] });
    const hint = detectALS(values(), masks, "als-xz", visible([{ cell: 5, digit: 3 }]));
    expect(hint.teaching.reasoning[0]).toContain("這一格就沒有數字可以填了");
    expect(hint.reason).not.toContain("只剩 ，");
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
