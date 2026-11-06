import { describe, expect, it } from "vitest";
import { ALL_DIGITS, bit, digitsMask } from "../game/board.js";
import { newGame } from "../game/game.js";
import { engineCandidates, findHint, findStep, TECHNIQUES } from "./engine.js";
import { firstObservation } from "./engine-observations.js";
import { legalMasks } from "./proof-verifier.js";
import corpus from "./fixtures/phase-three-corpus.json";

const blank = () => Array(81).fill(0);
const all = () => Array(81).fill(ALL_DIGITS);
const notesModes = /** @type {const} */ (["auto", "tidy"]);
const pairPuzzle =
  "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
const completed =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

// The genuine corpus supplies 18 earlier techniques. These three synthetic
// candidate models test presentation only; detector/proof tests remain separate.
function presentationExamples() {
  const result = corpus.fixtures.map((fixture) => ({
    values: [...fixture.values].map(Number),
    masks: fixture.masks,
  }));
  for (const size of [2, 3]) {
    const masks = all();
    for (let r = 0; r < size; r++) for (let c = size; c < 9; c++) masks[r * 9 + c] &= ~bit(7);
    result.push({ values: blank(), masks });
  }
  const masks = all();
  masks[3] = masks[15] = digitsMask([1, 2]);
  for (const cell of [18, 19, 20]) masks[cell] &= ~digitsMask([1, 2]);
  result.push({ values: blank(), masks });
  return result;
}

describe("earlier techniques start with useful board observations", () => {
  const examples = presentationExamples();
  for (const id of TECHNIQUES.slice(0, 21))
    it(`${id} describes its actual premise without giving an elimination`, () => {
      let found = 0;
      for (const { values, masks } of examples) {
        const step = findStep(values, masks, id);
        if (!step) continue;
        found++;
        const before = JSON.stringify({ step, values, masks });
        const observation = firstObservation(step, values, masks);
        const text = observation.description.join(" ");
        expect(observation.title.length).toBeGreaterThan(4);
        expect(observation.description.length).toBeGreaterThan(0);
        expect(text).toMatch(/只剩|只有|只出現|候選|已有/);
        expect(text).not.toMatch(/Auto|Tidy|已驗證|未寫下|視為|刪除|因此|必須填入|不能填/);
        for (const [, r, c] of text.matchAll(/r([1-9])c([1-9])/g))
          expect(step.premiseCells).toContain((Number(r) - 1) * 9 + Number(c) - 1);
        expect(JSON.stringify({ step, values, masks })).toBe(before);
      }
      expect(found, `Missing observation example for ${id}`).toBeGreaterThan(0);
    });

  for (const notesMode of notesModes)
    it(`full house starts with the eight existing values in ${notesMode}`, () => {
      const state = newGame("0" + completed.slice(1), { notesMode });
      const hint = findHint(state);
      expect(hint.techniqueId).toBe("full-house");
      expect(hint.stages).toHaveLength(3);
      expect(hint.stages[0].title).toBe("找出第 1 橫列缺少的數字");
      expect(hint.stages[0].description).toEqual([
        "第 1 橫列已有 3、4、6、7、8、9、1、2，只剩 r1c1 一格空白。",
      ]);
      expect(hint.stages[0].description.join(" ")).not.toContain("填入 5");
      expect(hint.placements).toEqual([{ cell: 0, digit: 5 }]);
      expect(hint.proof.source).toBe(notesMode === "auto" ? "player" : "board");
    });

  it("naked single shows the current Auto candidate, without changing player assumptions", () => {
    const initial = newGame("0".repeat(81), { notesMode: "auto" });
    const autoRemoved = blank();
    autoRemoved[0] = ALL_DIGITS & ~bit(1);
    const state = { ...initial, autoRemoved };
    const before = JSON.stringify(state);
    const hint = findHint(state);
    expect(hint.techniqueId).toBe("naked-single");
    expect(hint.stages[0].description).toEqual(["r1c1 目前只剩候選數 1。"]);
    expect(hint.stages[1].description).toEqual([hint.proof.step.reason]);
    expect(hint.candidateMasks[0]).toBe(bit(1));
    expect(hint.proof.source).toBe("player");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("hidden single points out a unique occurrence before naming its placement cell", () => {
    const initial = newGame("0".repeat(81), { notesMode: "auto" });
    const autoRemoved = blank();
    for (let cell = 0; cell < 8; cell++) autoRemoved[cell] = bit(9);
    const hint = findHint({ ...initial, autoRemoved });
    expect(hint.techniqueId).toBe("hidden-single");
    expect(hint.stages[0].description).toEqual([
      "第 1 橫列還有 9 格空白，但候選數 9 只出現在其中一格。先找出是哪一格。",
    ]);
    expect(hint.stages[0].description.join(" ")).not.toContain("r1c9");
    expect(hint.placements).toEqual([{ cell: 8, digit: 9 }]);
    expect(hint.stages[1].description.join(" ")).toContain("r1c9");
  });

  it("the default pair hint starts with candidate facts in both modes and preserves evidence", () => {
    const observations = [];
    for (const notesMode of notesModes) {
      const initial = newGame(pairPuzzle, { notesMode });
      const state = { ...initial, manualNotes: legalMasks(initial.givens) };
      const before = JSON.stringify(state);
      const { values, masks } = engineCandidates(state);
      const step = findStep(values, masks);
      const hint = findHint(state);
      expect(hint.techniqueId).toBe("naked-pair");
      expect(hint.stages).toHaveLength(3);
      expect(hint.stages[0].description.join(" ")).toContain("的候選數合起來只有");
      expect(hint.stages[0].coordinates).toEqual(step.premiseCells);
      expect(hint.observeCells).toEqual(step.premiseCells);
      expect(hint.premiseCells).toEqual(step.premiseCells);
      expect(hint.candidateMasks).toEqual(masks);
      expect(hint.placements).toEqual(step.placements);
      expect(hint.eliminations).toEqual(step.eliminations);
      expect(hint.proof.step).toEqual(step);
      expect(hint.stages[1].description).toEqual([step.reason]);
      expect(hint.stages[2].description).toEqual([hint.effect]);
      expect(JSON.stringify(state)).toBe(before);
      observations.push(hint.stages[0]);
    }
    expect(observations[0]).toEqual(observations[1]);
  });

  it("Tidy observations use the proof model even when premise notes are incomplete", () => {
    const initial = newGame(pairPuzzle, { notesMode: "tidy" });
    const state = { ...initial, manualNotes: legalMasks(initial.givens) };
    const hint = findHint(state);
    const incomplete = {
      ...state,
      manualNotes: state.manualNotes.map((mask, cell) =>
        hint.premiseCells.includes(cell) ? 0 : mask
      ),
    };
    const before = JSON.stringify(incomplete);
    const next = findHint(incomplete);
    expect(next.stages[0]).toEqual(hint.stages[0]);
    expect(next.candidateMasks).toEqual(hint.candidateMasks);
    expect(next.eliminations).toEqual(hint.eliminations);
    expect(JSON.stringify(incomplete)).toBe(before);
  });
});
