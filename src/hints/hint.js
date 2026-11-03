import { isVerifiedHint } from "./certificates.js";
import { bit } from "../game/board.js";
import { isCell, isDigit } from "../game/board.js";
import { hasCandidate, isLegal, setAnswer, toggleCandidate, valueAt } from "../game/game.js";

/** @typedef {{cell: number, digit: number}} Candidate */
/** @typedef {{title: string, description: string[], coordinates: number[]}} HintStage */
/**
 * UI data, independent of an engine's HTML, rating or search order.
 * Candidate masks come from the proof, never from incomplete player notes.
 * @typedef {Object} Hint
 * @property {string} techniqueId
 * @property {string} name
 * @property {[HintStage, HintStage, HintStage]} stages
 * @property {number[]} observeCells
 * @property {number[]} premiseCells
 * @property {Candidate[]} premiseCandidates
 * @property {Candidate[]} excludedCandidates
 * @property {Candidate[]} placements
 * @property {Candidate[]} eliminations
 * @property {number[]} candidateMasks
 * @property {{version:1,valuesKey:string,removed:number[],step:import("./proof-verifier.js").Step}} [proof]
 * @property {string} effect
 */
/** @typedef {(state: import('../game/game.js').GameState, options: {signal: AbortSignal}) => Promise<Hint | null>} HintProvider */

/** Includes notes/mode to reject stale UI actions; selection/time do not invalidate a proof.
 * @param {import('../game/game.js').GameState} state
 */
export function hintStateKey(state) {
  return JSON.stringify([
    state.givens,
    state.answers,
    state.notesMode,
    state.manualNotes,
    state.autoAdded,
    state.autoRemoved,
    state.trustedEliminations,
  ]);
}

/** Immutable payload for a future Worker/service adapter. Notes are input context, not logical premises.
 * @param {import('../game/game.js').GameState} state
 * @returns {import('../game/game.js').GameState}
 */
export function hintSnapshot(state) {
  return {
    givens: [...state.givens],
    answers: [...state.answers],
    notesMode: state.notesMode,
    manualNotes: [...state.manualNotes],
    autoAdded: [...state.autoAdded],
    autoRemoved: [...state.autoRemoved],
    ...(state.trustedEliminations
      ? {
          trustedEliminations: {
            ...state.trustedEliminations,
            removed: [...state.trustedEliminations.removed],
          },
        }
      : {}),
  };
}

/** Apply one displayed step as a single immutable history entry. Engine receipts
 * additionally update the independent ledger even when player notes are empty.
 * @param {import('../game/game.js').GameState} state
 * @param {Hint} hint
 */
export function applyHint(state, hint) {
  let next = state;
  const placementCells = new Set();
  for (const { cell, digit } of hint.placements) {
    if (
      placementCells.has(cell) ||
      hint.eliminations.some((p) => p.cell === cell && p.digit === digit)
    )
      throw new Error("Conflicting hint effects");
    placementCells.add(cell);
  }
  for (const { cell, digit } of [...hint.placements, ...hint.eliminations]) {
    if (!isCell(cell) || !isDigit(digit) || valueAt(state, cell))
      throw new Error("Invalid hint target");
  }
  for (const { cell, digit } of hint.placements) {
    if (!isLegal(next, cell, digit)) throw new Error("Invalid hint placement");
    next = setAnswer(next, cell, digit).state;
  }
  for (const { cell, digit } of hint.eliminations)
    if (hasCandidate(next, cell, digit)) next = toggleCandidate(next, cell, digit).state;
  if (hint.proof && isVerifiedHint(hint, hintStateKey(state))) {
    const removed = hint.proof.removed.slice();
    for (const { cell, digit } of hint.eliminations) removed[cell] |= bit(digit);
    for (const { cell } of hint.placements) removed[cell] = 0;
    next = {
      ...next,
      trustedEliminations: {
        version: 1,
        valuesKey: next.givens.map((v, i) => v || next.answers[i]).join(""),
        removed,
      },
    };
  } else if (hint.proof) {
    throw new Error("Hint proof has no verified receipt");
  }
  return next;
}
