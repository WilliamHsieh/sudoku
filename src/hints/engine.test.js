import { describe, it, expect } from "vitest";
import { findHint, engineCandidates, findStep, TECHNIQUES } from "./engine.js";
import { legalMasks, verifyStep, verifyLedger, hasCompletion } from "./proof-verifier.js";
import { newGame, setAnswer, toggleCandidate, restart, erase, clearCell } from "../game/game.js";
import { createHistory, commit, undo, redo, changedCells } from "../game/history.js";
import { toSnapshot, fromSnapshot } from "../game/snapshot.js";
import { applyHint, hintStateKey, hintSnapshot } from "./hint.js";
import { registerVerifiedHint } from "./certificates.js";
import { bit } from "../game/board.js";
const puzzle = "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
// Reference complete board used only for semantic-verifier adversarial checks.
const complete =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
describe("independent proof verifier and trusted ledger", () => {
  it("ignores incomplete/incorrect player notes and searches every exact family without dispatch failure", () => {
    const s = newGame(puzzle),
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
    expect(() => findHint(newGame(values.join("")))).toThrow("no completion");
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
  it("commits invisible logical elimination as one history step and restores ledger on undo/redo/save", () => {
    const s = newGame(puzzle);
    const hint = findHint(s);
    expect(hint).not.toBeNull();
    registerVerifiedHint(hint, hintStateKey(s));
    const next = applyHint(s, hint);
    expect(next.manualNotes).toEqual(s.manualNotes);
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
    const s = newGame(puzzle),
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
    const s = newGame(puzzle),
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
