// Game rules on an immutable state. Every action returns an ActionResult; when
// nothing changes, `state` is the same object that was passed in.
import {
  PEERS,
  ALL_DIGITS,
  bit,
  popcount,
  maskDigits,
  isCell,
  isDigit,
  parsePuzzle,
} from "./board.js";

/** @typedef {'auto' | 'tidy' | 'manual'} NotesMode */

/**
 * @typedef {Object} GameState
 * @property {readonly number[]} givens      81 digits, 0 = not a given
 * @property {readonly number[]} answers     81 digits, 0 = no answer (always 0 on givens)
 * @property {NotesMode} notesMode           which note set is shown and edited
 * @property {readonly number[]} manualNotes 81 digit masks (Manual mode's notes)
 * @property {readonly number[]} autoAdded   81 digit masks (Auto mode: added to the computed candidates)
 * @property {readonly number[]} autoRemoved 81 digit masks (Auto mode: removed from the computed candidates)
 */

/**
 * @typedef {Object} ActionResult
 * @property {GameState} state
 * @property {boolean} changed
 * @property {number[]} blockers cells that caused a refusal (empty unless refused)
 */

/** @typedef {'answer' | 'auto-overrides' | 'manual-notes'} EraseAction */

const zeros = () => new Array(81).fill(0);

/** @param {GameState} state @returns {ActionResult} */
const unchanged = (state) => ({ state, changed: false, blockers: [] });

/**
 * @param {GameState} state
 * @param {Partial<Record<'answers' | 'manualNotes' | 'autoAdded' | 'autoRemoved', number>>} cell
 * @param {number} i
 * @returns {ActionResult}
 */
function update(state, i, cell) {
  /** @type {any} */
  const next = { ...state };
  for (const [key, v] of Object.entries(cell)) {
    const arr = state[/** @type {keyof typeof cell} */ (key)].slice();
    arr[i] = v;
    next[key] = arr;
  }
  return { state: next, changed: true, blockers: [] };
}

/**
 * @param {string} puzzle 81 digits, 0 for empty
 * @param {{ notesMode?: NotesMode }} [options]
 * @returns {GameState}
 */
export function newGame(puzzle, { notesMode = "manual" } = {}) {
  return {
    givens: parsePuzzle(puzzle),
    answers: zeros(),
    notesMode,
    manualNotes: zeros(),
    autoAdded: zeros(),
    autoRemoved: zeros(),
  };
}

/** Same puzzle and notes mode, all progress cleared. @param {GameState} state @returns {GameState} */
export function restart(state) {
  return {
    ...state,
    answers: zeros(),
    manualNotes: zeros(),
    autoAdded: zeros(),
    autoRemoved: zeros(),
  };
}

/** The given or answer in cell i, 0 if empty. @param {GameState} state @param {number} i */
export const valueAt = (state, i) => state.givens[i] || state.answers[i];

/** @param {GameState} state @param {number} i */
export const isGiven = (state, i) => isCell(i) && state.givens[i] !== 0;

/** A cell the player may write in (any non-given cell). @param {GameState} state @param {number} i */
export const isEditable = (state, i) => isCell(i) && state.givens[i] === 0;

/** Digits not yet used by a peer, as a mask; 0 for a filled cell. @param {GameState} state @param {number} i */
export function computedCandidates(state, i) {
  if (valueAt(state, i)) return 0;
  let mask = ALL_DIGITS;
  for (const p of PEERS[i]) {
    const v = valueAt(state, p);
    if (v) mask &= ~bit(v);
  }
  return mask;
}

/**
 * The candidates shown in cell i, as a mask: Manual notes, or in Auto mode the
 * computed candidates with the player's overrides applied. 0 for a filled cell.
 * @param {GameState} state @param {number} i
 */
export function candidates(state, i) {
  if (valueAt(state, i)) return 0;
  if (state.notesMode !== "auto") return state.manualNotes[i];
  return (computedCandidates(state, i) & ~state.autoRemoved[i]) | state.autoAdded[i];
}

/** @param {GameState} state @param {number} i @param {number} d */
export const hasCandidate = (state, i, d) => (candidates(state, i) & bit(d)) !== 0;

/** Peers of cell i that already hold d (givens or answers). @param {GameState} state @param {number} i @param {number} d */
export const blockersOf = (state, i, d) => PEERS[i].filter((p) => valueAt(state, p) === d);

/** Whether d can go in cell i without repeating a peer's digit. @param {GameState} state @param {number} i @param {number} d */
export const isLegal = (state, i, d) => blockersOf(state, i, d).length === 0;

/** Cells whose digit repeats in their row, column or box. @param {GameState} state @returns {Set<number>} */
export function conflicts(state) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    const v = valueAt(state, i);
    if (v && PEERS[i].some((p) => valueAt(state, p) === v)) bad.add(i);
  }
  return bad;
}

/** Every cell filled and nothing repeats. @param {GameState} state */
export function isSolved(state) {
  for (let i = 0; i < 81; i++) if (!valueAt(state, i)) return false;
  return conflicts(state).size === 0;
}

/**
 * Writes answer d in cell i; writing the cell's current answer clears it.
 * Givens are untouched. Conflicting answers are allowed (and show in `conflicts`).
 * @param {GameState} state @param {number} i @param {number} d 1-9
 * @returns {ActionResult}
 */
export function setAnswer(state, i, d) {
  if (!isDigit(d)) throw new RangeError(`digit must be 1-9, got ${d}`);
  if (!isEditable(state, i)) return unchanged(state);
  const answer = state.answers[i] === d ? 0 : d;
  const result = update(state, i, { answers: answer });
  if (state.notesMode === "tidy" && answer) {
    const manualNotes = state.manualNotes.slice();
    for (const peer of PEERS[i]) manualNotes[peer] &= ~bit(answer);
    result.state = { ...result.state, manualNotes };
  }
  return result;
}

/** Whether toggling d in cell i would add it to the shown notes. @param {GameState} state @param {number} i @param {number} d */
export function isAdd(state, i, d) {
  return state.notesMode === "auto" ? !hasCandidate(state, i, d) : !(state.manualNotes[i] & bit(d));
}

/**
 * Toggles note d in the empty cell i, in the current notes mode. Removing is
 * always allowed; adding a digit a peer already holds is refused, and the
 * result lists those peers as `blockers`.
 * @param {GameState} state @param {number} i @param {number} d 1-9
 * @returns {ActionResult}
 */
export function toggleCandidate(state, i, d) {
  if (!isDigit(d)) throw new RangeError(`digit must be 1-9, got ${d}`);
  if (!isEditable(state, i) || state.answers[i]) return unchanged(state);
  const b = bit(d);
  if (isAdd(state, i, d)) {
    const blockers = blockersOf(state, i, d);
    if (blockers.length) return { state, changed: false, blockers };
  }
  if (state.notesMode !== "auto")
    return update(state, i, { manualNotes: state.manualNotes[i] ^ b });

  let added = state.autoAdded[i];
  let removed = state.autoRemoved[i];
  if (hasCandidate(state, i, d)) {
    added &= ~b;
    if (computedCandidates(state, i) & b) removed |= b;
  } else if (removed & b) {
    removed &= ~b;
  } else {
    added |= b;
  }
  return update(state, i, { autoAdded: added, autoRemoved: removed });
}

/**
 * What Erase would clear in cell i: the answer if there is one, otherwise the
 * current mode's own notes (Auto: the overrides, Manual: the notes). Null when
 * Erase would not visibly change the cell: a given, no notes, or in Auto only
 * stale overrides (e.g. a removed digit that a peer has since taken), since
 * resetting to the computed candidates would show the same digits.
 * @param {GameState} state @param {number} i
 * @returns {EraseAction | null}
 */
export function eraseAction(state, i) {
  if (!isEditable(state, i)) return null;
  if (state.answers[i]) return "answer";
  if (state.notesMode === "auto")
    return candidates(state, i) !== computedCandidates(state, i) ? "auto-overrides" : null;
  return state.manualNotes[i] ? "manual-notes" : null;
}

/**
 * Erase: clears the answer, or else the current mode's notes for cell i (Auto
 * resets the cell to its computed candidates). The other mode's notes are kept.
 *
 * Differs from `clearCell` (right-click) on an answered cell in Auto mode:
 * Erase clears only the answer and keeps the cell's overrides, so a second
 * Erase is needed to reset them; right-click clears both in one step.
 * @param {GameState} state @param {number} i
 * @returns {ActionResult}
 */
export function erase(state, i) {
  const action = eraseAction(state, i);
  if (action === "answer") return update(state, i, { answers: 0 });
  if (action === "auto-overrides") return update(state, i, { autoAdded: 0, autoRemoved: 0 });
  if (action === "manual-notes") return update(state, i, { manualNotes: 0 });
  return unchanged(state);
}

/**
 * Right-click clear: an answer goes together with the cell's Auto overrides
 * when in Auto mode (so the computed candidates come back); an empty cell gets
 * Erase; givens are untouched.
 *
 * Differs from `erase` on an answered cell in Auto mode: right-click clears the
 * answer and the overrides in one step, Erase clears only the answer. In Manual
 * mode both clear only the answer and keep the notes.
 * @param {GameState} state @param {number} i
 * @returns {ActionResult}
 */
export function clearCell(state, i) {
  if (!isEditable(state, i)) return unchanged(state);
  if (!state.answers[i]) return erase(state, i);
  if (state.notesMode === "auto")
    return update(state, i, { answers: 0, autoAdded: 0, autoRemoved: 0 });
  return update(state, i, { answers: 0 });
}

/** Switches which note set is shown; both sets are kept. @param {GameState} state @param {NotesMode} mode @returns {GameState} */
export function setNotesMode(state, mode) {
  if (mode !== "auto" && mode !== "tidy" && mode !== "manual")
    throw new RangeError(`unknown notes mode ${mode}`);
  return state.notesMode === mode ? state : { ...state, notesMode: mode };
}

/**
 * The digit a fill gesture (double-tap) would enter in cell i, or 0.
 * Manual mode uses only the focused digit, regardless of notes. Auto mode
 * prefers a lone shown candidate (including overrides), then the focused
 * digit. Without either, nothing is entered. Givens and existing answers
 * are left alone.
 * @param {GameState} state @param {number} i @param {number} [highlighted] digit focused before the gesture, 0 for none
 */
export function fillDigit(state, i, highlighted = 0) {
  if (!isEditable(state, i) || state.answers[i]) return 0;
  if (state.notesMode === "auto") {
    const cand = candidates(state, i);
    if (popcount(cand) === 1) return maskDigits(cand)[0];
  }
  if (isDigit(highlighted)) return highlighted;
  return 0;
}

/**
 * Enters `fillDigit(state, i, highlighted)` if there is one.
 * @param {GameState} state @param {number} i @param {number} [highlighted]
 * @returns {ActionResult}
 */
export function fill(state, i, highlighted = 0) {
  const d = fillDigit(state, i, highlighted);
  return d ? setAnswer(state, i, d) : unchanged(state);
}
