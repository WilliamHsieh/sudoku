// English keypad copy. The Traditional Chinese in the r2 prototype is mockup
// text; these follow the short style of the master's hint line.

/** @typedef {{ kind: 'plain', text: string } | { kind: 'rich', lead: string, rest: string }} Hint */

export const HINT_IDLE = "Tap = show · Double-tap = fill · Swipe ↑ candidate, ↓ lock";
export const HINT_LEGACY = "Tap = answer · Swipe up = candidate";

export const LABEL_HOLD = "Tap or slide cells";
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
  { label: "Swipe down", body: "Locks it; tap or slide across empty cells to toggle candidates" },
];

export const DESKTOP_COACH_ROWS = [
  { label: "Click", body: "Highlights this digit and its candidates" },
  { label: "Double-click", body: "Fills the selected cell" },
  { label: "Drag up", body: "Toggles a candidate in the selected cell" },
  {
    label: "Shift + click",
    body: "Locks a digit; click or drag across cells to toggle candidates",
  },
];

/** @param {number} d */
export const toastLockedCell = (d) => `${d} locked — tap an empty cell`;
/** @param {number} d */
export const toastBlocked = (d) => `Can't place ${d} — already in row, column or box`;
export const TOAST_NO_CELL = "Select a cell, then double-tap";
export const TOAST_GIVEN = "Given digits can't change";

/** @param {number} d @param {boolean} [desktop] */
export const ariaLocked = (d, desktop = false) =>
  desktop
    ? `Digit ${d}, locked: click or drag across empty cells to toggle, click again to unlock`
    : `Digit ${d}, locked: tap or slide across empty cells to toggle, tap again to unlock`;
/** @param {number} d @param {boolean} [desktop] */
export const ariaShow = (d, desktop = false) =>
  desktop
    ? `Digit ${d}: click to show, double-click to fill`
    : `Digit ${d}: tap to show, double-tap to fill`;
/** @param {number} d */
export const ariaEnter = (d) => `Enter ${d}`;

/**
 * Hint line under the keypad. Legacy mode keeps the master's sentence unless
 * a digit is locked, which always explains the lock.
 * @param {{ legacy: boolean, locked: number, shown: number, placed: number, desktop?: boolean }} s
 * @returns {Hint}
 */
export function hintModel(s) {
  if (s.locked) {
    return {
      kind: "rich",
      lead: `${s.locked} locked`,
      rest: s.desktop
        ? `· Space toggles candidate ${s.locked} · Enter fills answer ${s.locked} in the selected cell · Esc unlocks`
        : `· Tap or slide across cells · Tap ${s.locked} to unlock`,
    };
  }
  if (s.legacy)
    return {
      kind: "plain",
      text: s.desktop ? "Click = answer · Drag up = candidate" : HINT_LEGACY,
    };
  if (s.shown) {
    const left = 9 - s.placed;
    const count = left > 0 ? `${left} left` : "all placed";
    return {
      kind: "rich",
      lead: String(s.shown),
      rest: s.desktop
        ? `· ${count} · Double-click fills · Shift + click locks`
        : `· ${count} · Double-tap fills · Swipe down locks`,
    };
  }
  return {
    kind: "plain",
    text: s.desktop ? "Click to show · Double-click to fill · Drag up for candidate" : HINT_IDLE,
  };
}
