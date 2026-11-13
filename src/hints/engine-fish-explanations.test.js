import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit } from "../game/board.js";
import { detectPattern } from "./engine-patterns.js";
import { findHint, findStep } from "./engine.js";
import { newGame } from "../game/game.js";
import { legalMasks, verifyStep } from "./proof-verifier.js";
import { fishCases } from "./fixtures/finned-fish-cases.js";
import { firstObservation } from "./engine-observations.js";

const ids = [
  ["x-wing", 2],
  ["swordfish", 3],
  ["jellyfish", 4],
  ["finned-x-wing", 2],
  ["finned-swordfish", 3],
];
const coord = (cell) => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

describe("fish explanations", () => {
  for (const [id, size] of ids)
    for (const transposed of [false, true])
      for (const finCount of String(id).startsWith("finned") ? [1, 2] : [0]) {
        it(`${id}: ${transposed ? "columns" : "rows"}, ${finCount} fins`, () => {
          const n = Number(size);
          const at = (r, c) => (transposed ? c * 9 + r : r * 9 + c);
          const bases = [0, 3, 6, 8].slice(0, n);
          const covers = [0, 4, 7, 8].slice(0, n);
          const fins = Array.from({ length: finCount }, (_, i) => at(0, i + 1));
          const masks = Array(81).fill(ALL_DIGITS);
          for (const r of bases)
            for (let c = 0; c < 9; c++) if (!covers.includes(c)) masks[at(r, c)] &= ~bit(7);
          for (const cell of fins) masks[cell] |= bit(7);
          const step = detectPattern(Array(81).fill(0), masks, String(id));
          expect(step).not.toBeNull();
          const reason = step.reason;
          const baseName = transposed ? "直行" : "橫列";
          const coverName = transposed ? "橫列" : "直行";
          const baseList = `第 ${bases.map((b) => b + 1).join("、")} ${baseName}`;
          const coverList = `第 ${covers.map((c) => c + 1).join("、")} ${coverName}`;
          expect(reason).not.toMatch(/來源線|覆蓋線|若鰭成立|若鰭全部不成立/);
          expect(reason).toContain(`${baseList}都還沒填入 7`);
          expect(reason).toContain(`每個${baseName}都必須有一個 7`);
          expect(reason).toContain(`只剩魚形本體的位置，全部位於${coverList}`);
          expect(reason).toContain(`同一${coverName}不能有兩個 7`);
          expect(reason).toContain(`${n} 個 7 必須分別占用這 ${n} 個${coverName}`);
          expect(reason).toContain(`這些${coverName}中的 7 都在${baseList}內`);
          for (const { cell, digit } of step.eliminations) {
            expect(reason).toContain(coord(cell));
            expect(digit).toBe(7);
          }
          expect(reason).toContain("可刪除候選數 7");
          if (finCount) {
            expect(reason).toContain(
              finCount === 1
                ? `若 ${coord(fins[0])} 填入 7`
                : `若 ${fins.map(coord).join("、")} 中至少一格填入 7`
            );
            expect(reason).toContain("同一宮不能有兩個 7");
            expect(reason).toContain(
              finCount === 1
                ? `若 ${coord(fins[0])} 不填 7`
                : `若 ${fins.map(coord).join("、")} 都不填 7`
            );
            expect(reason).toContain("兩種情況下");
            expect(reason).toContain(
              `${[at(1, 0), at(2, 0)].map(coord).join("、")} 位於第 1 ${coverName}`
            );
            expect(step.eliminations.map((e) => e.cell)).toEqual([at(1, 0), at(2, 0)]);
          }
          const observation = firstObservation(step, Array(81).fill(0), masks);
          expect(observation.description.join("")).not.toMatch(/若|必須|刪除|不能/);
          for (const cell of step.premiseCells)
            expect(observation.description.join("")).toContain(coord(cell));

          // Enumerate every non-repeating placement across the selected lines.
          // This checks the counting argument, including both fin branches,
          // without assuming which diagonal or permutation will be chosen.
          let finTrue = 0;
          let allFinsFalse = 0;
          function visit(index, chosen) {
            if (index === n) {
              const hasFin = chosen.some((cell) => fins.includes(cell));
              if (hasFin) finTrue++;
              else {
                allFinsFalse++;
                expect(
                  new Set(chosen.map((cell) => (transposed ? Math.floor(cell / 9) : cell % 9)))
                ).toEqual(new Set(covers));
              }
              for (const target of step.eliminations)
                expect(
                  chosen.some((cell) => {
                    const sameRow = Math.floor(cell / 9) === Math.floor(target.cell / 9);
                    const sameCol = cell % 9 === target.cell % 9;
                    const sameBox =
                      Math.floor(cell / 27) === Math.floor(target.cell / 27) &&
                      Math.floor((cell % 9) / 3) === Math.floor((target.cell % 9) / 3);
                    return sameRow || sameCol || sameBox;
                  })
                ).toBe(true);
              return;
            }
            for (let c = 0; c < 9; c++) {
              const cell = at(bases[index], c);
              if (!(masks[cell] & bit(7))) continue;
              if (chosen.some((old) => (transposed ? Math.floor(old / 9) : old % 9) === c))
                continue;
              visit(index + 1, [...chosen, cell]);
            }
          }
          visit(0, []);
          expect(allFinsFalse).toBeGreaterThan(0);
          if (finCount) expect(finTrue).toBeGreaterThan(0);
        });
      }
});

it("explains the issue's column-oriented 9 pattern with its actual coordinates", () => {
  const masks = Array(81).fill(ALL_DIGITS);
  for (const c of [2, 6])
    for (let r = 0; r < 9; r++) if (![0, 7].includes(r)) masks[r * 9 + c] &= ~bit(9);
  masks[24] |= bit(9);
  const step = detectPattern(Array(81).fill(0), masks, "finned-x-wing");
  expect(step.reason).toContain("r1c3、r8c3、r1c7、r8c7");
  expect(step.reason).toContain("若 r3c7 不填 9");
  expect(step.reason).toContain("第 3、7 直行都還沒填入 9");
  expect(step.reason).toContain("全部位於第 1、8 橫列");
  expect(step.reason).toContain("同一橫列不能有兩個 9");
  expect(step.eliminations).toEqual([
    { cell: 7, digit: 9 },
    { cell: 8, digit: 9 },
  ]);
  expect(step.reason).toContain("r1c8、r1c9 都不能是 9");
});

for (const fixture of fishCases)
  it(`${fixture.name}: real hint keeps the proof, candidates and exact cell references`, () => {
    const values = [...fixture.values].map(Number);
    const solution = [...fixture.solution].map(Number);
    const legal = legalMasks(values);
    fixture.masks.forEach((mask, cell) => {
      expect(values[cell] || solution[cell]).toBe(solution[cell]);
      expect(mask & ~legal[cell]).toBe(0);
      if (!values[cell]) expect(mask & bit(solution[cell])).not.toBe(0);
    });
    const step = findStep(values, fixture.masks);
    expect(step.techniqueId).toBe("finned-x-wing");
    expect(() => verifyStep(values, fixture.masks, step)).not.toThrow();
    const state = {
      ...newGame(fixture.values, { notesMode: "auto" }),
      autoRemoved: legal.map((mask, cell) => mask & ~fixture.masks[cell]),
    };
    const before = JSON.stringify(state);
    const hint = findHint(state);
    expect(hint.stages[0].description).toHaveLength(1);
    expect(hint.stages[1].description).toHaveLength(5);
    expect(hint.stages[1].description).toEqual(step.reason.split("\n"));
    expect(hint.eliminations).toEqual(fixture.targetCells.map((cell) => ({ cell, digit: 7 })));
    expect(step.premiseCells).toEqual([5, 6, ...fixture.finCells, 32, 33]);
    const reason = hint.stages[1].description;
    const fins = fixture.finCells.map(coord).join("、");
    const targets = fixture.targetCells.map(coord).join("、");
    expect(reason[1]).toContain(
      fixture.finCells.length === 1 ? `若 ${fins} 填入 7` : `若 ${fins} 中至少一格填入 7`
    );
    expect(reason[2]).toContain(
      fixture.finCells.length === 1 ? `若 ${fins} 不填 7` : `若 ${fins} 都不填 7`
    );
    expect(reason[3]).toContain(`${targets} 位於第 7 直行，卻不在第 1、4 橫列內`);
    expect(reason[1]).toContain(
      fixture.targetCells.length === 1 ? "所以這個目標格不能填 7" : "所以這些目標格不能填 7"
    );
    expect(reason[4]).toBe(
      `兩種情況下，${targets} ${fixture.targetCells.length === 1 ? "" : "都"}不能是 7，因此可刪除候選數 7。`
    );
    expect(reason.join("")).not.toMatch(/r1c8 (?:中有一格|全都)/);
    expect(hint.proof.step).toEqual(step);
    expect(JSON.stringify(state)).toBe(before);
  });
