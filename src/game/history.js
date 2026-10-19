// Snapshot undo/redo over immutable game states: one step per committed change.
// The notes mode is a view setting, not an edit: undo and redo keep the current one.

/**
 * @typedef {Object} History
 * @property {readonly import('./game.js').GameState[]} past   oldest first
 * @property {import('./game.js').GameState} present
 * @property {readonly import('./game.js').GameState[]} future next redo last
 * @property {number} limit                max undo steps kept
 */

/** @param {import('./game.js').GameState} state @param {{ limit?: number }} [options] @returns {History} */
export function createHistory(state, { limit = 500 } = {}) {
  return { past: [], present: state, future: [], limit };
}

/**
 * Records a user action. A result or state identical to the present is not a
 * step. Any new step clears the redo stack.
 * @param {History} history @param {import('./game.js').GameState | import('./game.js').ActionResult} next
 * @returns {History}
 */
export function commit(history, next) {
  const state = "state" in next ? next.state : next;
  if (state === history.present) return history;
  const past = [...history.past, history.present].slice(-history.limit);
  return { ...history, past, present: state, future: [] };
}

/**
 * Replaces the present without an undo step (e.g. a notes mode switch).
 * @param {History} history @param {import('./game.js').GameState} state
 * @returns {History}
 */
export function replace(history, state) {
  return state === history.present ? history : { ...history, present: state };
}

/** @param {History} history */
export const canUndo = (history) => history.past.length > 0;
/** @param {History} history */
export const canRedo = (history) => history.future.length > 0;

/** @param {import('./game.js').GameState} state @param {import('./game.js').GameState} view */
const inModeOf = (state, view) =>
  state.notesMode === view.notesMode ? state : { ...state, notesMode: view.notesMode };

/** @param {History} history @returns {History} */
export function undo(history) {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  const present = inModeOf(history.past[history.past.length - 1], history.present);
  return { ...history, past, present, future: [...history.future, history.present] };
}

/** @param {History} history @returns {History} */
export function redo(history) {
  if (!canRedo(history)) return history;
  const future = history.future.slice(0, -1);
  const present = inModeOf(history.future[history.future.length - 1], history.present);
  return { ...history, past: [...history.past, history.present], present, future };
}

/**
 * Cells whose answer or notes differ between two states (for the UI to point at).
 * @param {import('./game.js').GameState} a @param {import('./game.js').GameState} b
 * @returns {number[]}
 */
export function changedCells(a, b) {
  const out = [];
  for (let i = 0; i < 81; i++) {
    if (
      a.answers[i] !== b.answers[i] ||
      a.manualNotes[i] !== b.manualNotes[i] ||
      a.autoAdded[i] !== b.autoAdded[i] ||
      a.autoRemoved[i] !== b.autoRemoved[i]
    ) {
      out.push(i);
    }
  }
  return out;
}
