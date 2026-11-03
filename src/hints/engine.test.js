import { describe, it, expect } from "vitest";
import { findHint, engineCandidates, findStep, TECHNIQUES } from "./engine.js";
import { legalMasks, verifyStep, verifyLedger, hasCompletion } from "./proof-verifier.js";
import {
  newGame,
  setAnswer,
  setNotesMode,
  toggleCandidate,
  restart,
  erase,
  clearCell,
} from "../game/game.js";
import { createHistory, commit, undo, redo, changedCells } from "../game/history.js";
import { toSnapshot, fromSnapshot } from "../game/snapshot.js";
import { applyHint, hintStateKey, hintSnapshot } from "./hint.js";
import { registerVerifiedHint } from "./certificates.js";
import { bit } from "../game/board.js";
const notedGame = (puzzle) => {
  const state = newGame(puzzle, { notesMode: "tidy" });
  return { ...state, manualNotes: legalMasks(state.givens) };
};
const puzzle = "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
// Reference complete board used only for semantic-verifier adversarial checks.
const complete =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
describe("independent proof verifier and trusted ledger", () => {
  it("ignores incomplete/incorrect player notes and searches every exact family without dispatch failure", () => {
    const s = notedGame(puzzle),
      values = [...s.givens],
      m = legalMasks(values);
    expect(findHint(s)?.techniqueId).toBe("naked-pair");
    expect(findHint(toggleCandidate(s, 12, 1).state)?.eliminations).toEqual(
      findHint(s)?.eliminations
    );
    for (const id of TECHNIQUES) expect(() => findStep(values, m, id)).not.toThrow();
  });
  it("rejects a step agreeing with only one completion on an ambiguous board", () => {
    const values = Array(81).fill(0),
      masks = legalMasks(values);
    expect(() =>
      verifyStep(values, masks, {
        techniqueId: "fake",
        premiseCells: [],
        reason: "",
        placements: [{ cell: 0, digit: 1 }],
        eliminations: [],
      })
    ).toThrow("Unproved placement");
    expect(() =>
      verifyStep(values, masks, {
        techniqueId: "fake",
        premiseCells: [],
        reason: "",
        placements: [],
        eliminations: [{ cell: 0, digit: 1 }],
      })
    ).toThrow("Unproved elimination");
  });
  it("fails closed on unsatisfiable boards, empty effects and exhausted budgets", () => {
    const values = [...complete].map(Number);
    values[0] = values[1];
    expect(hasCompletion(values, legalMasks(values))).toBe(false);
    expect(() => findHint(newGame(values.join(""), { notesMode: "tidy" }))).toThrow(
      "no completion"
    );
    expect(() =>
      hasCompletion(Array(81).fill(0), Array(81).fill(1022), { nodes: 0, limit: 1 })
    ).toThrow("budget");
    expect(() =>
      verifyStep([...complete].map(Number), Array(81).fill(0), {
        techniqueId: "x",
        premiseCells: [],
        placements: [],
        eliminations: [],
        reason: "",
      })
    ).toThrow("Empty proof");
  });
  it("commits a visible elimination as one history step and restores ledger on undo/redo/save", () => {
    const s = notedGame(puzzle);
    const hint = findHint(s);
    expect(hint).not.toBeNull();
    registerVerifiedHint(hint, hintStateKey(s));
    const next = applyHint(s, hint);
    expect(next.manualNotes[77] & bit(5)).toBe(0);
    expect(s.manualNotes[77] & bit(5)).toBeTruthy();
    expect(changedCells(s, next)).toContain(77);
    expect(next.trustedEliminations.removed[77] & bit(5)).toBeTruthy();
    expect(engineCandidates(next).masks[77] & bit(5)).toBe(0);
    let h = commit(createHistory(s), next);
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present).toBe(s);
    h = redo(h);
    expect(h.present).toBe(next);
    const restored = fromSnapshot(toSnapshot(next));
    expect(engineCandidates(restored)).toEqual(engineCandidates(next));
    expect(hintSnapshot(next).trustedEliminations).not.toBe(next.trustedEliminations);
  });
  it("rejects forged receipts, stale fingerprints and tampered persisted eliminations", () => {
    const s = notedGame(puzzle),
      hint = findHint(s);
    expect(() => applyHint(s, hint)).toThrow("receipt");
    registerVerifiedHint(hint, hintStateKey(s));
    const changed = toggleCandidate(s, 12, 1).state;
    expect(() => applyHint(changed, hint)).toThrow("receipt");
    const values = [...complete].map(Number);
    values[0] = 0;
    const removed = Array(81).fill(0);
    removed[0] = bit(5);
    expect(() => verifyLedger(values, removed)).toThrow("Unproved elimination");
    expect(() => {
      hint.eliminations[0].digit = 1;
    }).toThrow();
  });
  it("invalidates proof assumptions on manual answer edits/erase/restart, not note edits", () => {
    const s = notedGame(puzzle),
      hint = findHint(s);
    registerVerifiedHint(hint, hintStateKey(s));
    const next = applyHint(s, hint);
    const edited = setAnswer(next, 12, 1).state;
    expect(edited.trustedEliminations).toBeUndefined();
    expect(restart(next).trustedEliminations).toBeUndefined();
    expect(toggleCandidate(next, 12, 1).state.trustedEliminations).toBe(next.trustedEliminations);
    const withAnswer = { ...edited, trustedEliminations: next.trustedEliminations };
    expect(erase(withAnswer, 12).state.trustedEliminations).toBeUndefined();
    expect(clearCell(withAnswer, 12).state.trustedEliminations).toBeUndefined();
  });
});

describe("visible hint effects", () => {
  it("does not offer hints in Manual mode", () => {
    expect(findHint(newGame(puzzle))).toBeNull();
  });
  it("does not offer an elimination when Tidy notes contain no target", () => {
    const state = newGame(puzzle, { notesMode: "tidy" });
    expect(findHint(state)).toBeNull();
    expect(state.trustedEliminations).toBeUndefined();
  });
  it("uses Tidy notes to select visible effects, never to manufacture logical premises", () => {
    const state = newGame("0".repeat(81), { notesMode: "tidy" });
    const withFalseSingle = toggleCandidate(state, 0, 1).state;
    expect(engineCandidates(withFalseSingle).masks[0]).toBe(1022);
    expect(findHint(withFalseSingle)).toBeNull();
  });
  it("still places a board-proved digit absent from Tidy notes", () => {
    const state = newGame("0" + complete.slice(1), { notesMode: "tidy" });
    expect(findHint(state)?.placements).toEqual([{ cell: 0, digit: 5 }]);
  });
  it("does not add hidden ledger state or history for an already absent effect", () => {
    const state = newGame(puzzle, { notesMode: "tidy" });
    const raw = findHint(notedGame(puzzle));
    const hint = { ...raw, proof: { ...raw.proof } };
    registerVerifiedHint(hint, hintStateKey(state));
    const next = applyHint(state, hint);
    expect(next).toBe(state);
    expect(next.trustedEliminations).toBeUndefined();
    expect(commit(createHistory(state), next).past).toHaveLength(0);
  });
  it("skips an ineffective instance but finds another naked pair in the same technique", () => {
    const values = Array(81).fill(0);
    const masks = legalMasks(values);
    masks[0] = masks[1] = bit(1) | bit(2);
    masks[27] = masks[28] = bit(3) | bit(4);
    const visible = Array(81).fill(0);
    visible[29] = bit(3);
    const step = findStep(values, masks, "naked-pair", visible);
    expect(step?.premiseCells).toEqual([27, 28]);
    expect(step?.eliminations).toEqual([{ cell: 29, digit: 3 }]);
  });
  it("filters individual effects rather than advertising already absent targets", () => {
    const values = Array(81).fill(0);
    const masks = legalMasks(values);
    masks[0] = masks[1] = bit(1) | bit(2);
    const visible = Array(81).fill(0);
    visible[2] = bit(2);
    expect(findStep(values, masks, "naked-pair", visible)?.eliminations).toEqual([
      { cell: 2, digit: 2 },
    ]);
  });
  it("skips an ineffective fish and finds a later digit of the same family", () => {
    const values = Array(81).fill(0);
    const masks = legalMasks(values);
    for (let c = 2; c < 9; c++) for (const r of [0, 1]) masks[r * 9 + c] &= ~bit(7);
    for (let c = 0; c < 9; c++)
      if (![3, 4].includes(c)) for (const r of [3, 4]) masks[r * 9 + c] &= ~bit(8);
    const visible = Array(81).fill(0);
    visible[48] = bit(8);
    expect(findStep(values, masks, "x-wing", visible)?.eliminations).toEqual([
      { cell: 48, digit: 8 },
    ]);
  });
  it("skips an ineffective wing and finds a later wing of the same technique", () => {
    const values = Array(81).fill(0);
    const masks = legalMasks(values);
    masks[0] = bit(1) | bit(2);
    masks[3] = bit(1) | bit(3);
    masks[27] = bit(2) | bit(3);
    masks[80] = bit(4) | bit(5);
    masks[77] = bit(4) | bit(6);
    masks[53] = bit(5) | bit(6);
    const visible = Array(81).fill(0);
    visible[50] = bit(6);
    expect(findStep(values, masks, "xy-wing", visible)?.eliminations).toEqual([
      { cell: 50, digit: 6 },
    ]);
  });
});

describe("mode-specific candidate assumptions", () => {
  it("uses Auto's current visible candidates, including player omissions", () => {
    let state = newGame("0".repeat(81), { notesMode: "auto" });
    for (let digit = 2; digit <= 9; digit++) state = toggleCandidate(state, 0, digit).state;
    expect(engineCandidates(state).masks[0]).toBe(bit(1));
    const hint = findHint(state);
    expect(hint?.techniqueId).toBe("naked-single");
    expect(hint?.placements).toEqual([{ cell: 0, digit: 1 }]);
    expect(hint?.proof?.source).toBe("player");
    // The same placement is not implied by the board alone. Auto deliberately
    // accepts the player's omissions, rather than silently restoring them.
    expect(() => verifyStep(state.givens, legalMasks(state.givens), hint.proof.step)).toThrow(
      "Unproved placement"
    );
  });
  it("keeps Auto eliminations in visible overrides without certifying their assumptions for Tidy", () => {
    let state = newGame("0".repeat(81), { notesMode: "auto" });
    for (const cell of [0, 1])
      for (let digit = 3; digit <= 9; digit++) state = toggleCandidate(state, cell, digit).state;
    const hint = findHint(state);
    expect(hint?.techniqueId).toBe("naked-pair");
    registerVerifiedHint(hint, hintStateKey(state));
    const next = applyHint(state, hint);
    expect(next.autoRemoved[2] & (bit(1) | bit(2))).toBe(bit(1) | bit(2));
    expect(next.trustedEliminations).toBeUndefined();
    const tidy = setNotesMode(next, "tidy");
    expect(engineCandidates(tidy).masks[0]).toBe(1022);
    expect(engineCandidates(tidy).masks[2]).toBe(1022);
    const restored = fromSnapshot(toSnapshot(next));
    expect(engineCandidates(restored)).toEqual(engineCandidates(next));
  });
  it("does not repeat a completed Tidy elimination, but permits it after undo or re-add", () => {
    const state = notedGame(puzzle);
    const hint = findHint(state);
    registerVerifiedHint(hint, hintStateKey(state));
    const next = applyHint(state, hint);
    const following = findHint(next);
    expect(following?.eliminations).not.toEqual(hint.eliminations);
    for (const effect of hint.eliminations)
      expect(following?.eliminations).not.toContainEqual(effect);
    const readded = toggleCandidate(next, 77, 5).state;
    expect(findHint(readded)?.eliminations).toEqual(hint.eliminations);
    const history = undo(commit(createHistory(state), next));
    expect(findHint(history.present)?.eliminations).toEqual(hint.eliminations);
  });
});

it("does not repeat completed Auto effects, and undo/re-add restores eligibility", () => {
  const state = newGame(puzzle, { notesMode: "auto" });
  const hint = findHint(state);
  registerVerifiedHint(hint, hintStateKey(state));
  const next = applyHint(state, hint);
  const following = findHint(next);
  for (const effect of hint.eliminations)
    expect(following?.eliminations).not.toContainEqual(effect);
  expect(findHint(toggleCandidate(next, 77, 5).state)?.eliminations).toEqual(hint.eliminations);
  expect(findHint(undo(commit(createHistory(state), next)).present)?.eliminations).toEqual(
    hint.eliminations
  );
});
