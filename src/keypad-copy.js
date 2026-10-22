// English keypad copy. The Traditional Chinese in the r2 prototype is mockup
// text; these follow the short style of the master's hint line.

/** @typedef {{ kind: 'plain', text: string } | { kind: 'rich', lead: string, rest: string }} Hint */

export const HINT_IDLE = "Tap = show · Double-tap = fill · Swipe ↑ candidate, ↓ lock";
export const HINT_LEGACY = "Tap = answer · Swipe up = candidate";

export const LABEL_HOLD = "Tap cells: candidate";
export const LABEL_LOCK = "Release: lock";
export const LABEL_UNLOCK = "Release: unlock";

export const OPT_TAP_TITLE = "Tap to fill";
export const OPT_TAP_SUB = "Off: tap shows, double-tap fills";

export const COACH_TITLE = "New way to use the keys";
export const COACH_OK = "Got it";
/** @type {{ label: string, body: string }[]} */
export const COACH_ROWS = [
  { label: "Tap", body: "Highlights this digit and its candidates" },
  { label: "Double-tap", body: "Fills the selected cell" },
  { label: "Swipe down", body: "Locks it; tap empty cells to toggle candidates" },
];

/** @param {number} d */
export const toastLockedCell = (d) => `${d} locked — tap an empty cell`;
/** @param {number} d */
export const toastBlocked = (d) => `Can't place ${d} — already in row, column or box`;
export const TOAST_NO_CELL = "Select a cell, then double-tap";
export const TOAST_GIVEN = "Given digits can't change";

/** @param {number} d */
export const ariaLocked = (d) =>
  `Digit ${d}, locked: tap empty cells to toggle, tap again to unlock`;
/** @param {number} d */
export const ariaShow = (d) => `Digit ${d}: tap to show, double-tap to fill`;
/** @param {number} d */
export const ariaEnter = (d) => `Enter ${d}`;

/**
 * Hint line under the keypad. Legacy mode keeps the master's sentence unless
 * a digit is locked, which always explains the lock.
 * @param {{ legacy: boolean, locked: number, shown: number, placed: number }} s
 * @returns {Hint}
 */
export function hintModel(s) {
  if (s.locked) {
    return {
      kind: "rich",
      lead: `${s.locked} locked`,
      rest: `· Tap empty cells to toggle · Tap ${s.locked} to unlock`,
    };
  }
  if (s.legacy) return { kind: "plain", text: HINT_LEGACY };
  if (s.shown) {
    const left = 9 - s.placed;
    const count = left > 0 ? `${left} left` : "all placed";
    return {
      kind: "rich",
      lead: String(s.shown),
      rest: `· ${count} · Double-tap fills · Swipe down locks`,
    };
  }
  return { kind: "plain", text: HINT_IDLE };
}
