// Keypad r2 decisions: show, double-tap fill, swipe-down lock. No DOM.
// Swipe-up thresholds stay in pad.js and are unchanged.

import { ARM_PX, DISARM_PX, DOUBLE_TAP_MS, TAP_MAX_MS, TAP_MAX_TRAVEL } from "./pad.js";

export const HOLD_MS = 250;
/** Swipe-down must be steeper than this times the horizontal travel. */
export const LOCK_RATIO = 0.75;
export const HIDE_MS = DOUBLE_TAP_MS;
export const LOCK_TICK_MS = 700;
export const TOAST_MS = 1600;

/**
 * Arm/disarm a swipe-down. Arms at {@link ARM_PX} when the drag is clearly
 * downward; disarms below {@link DISARM_PX}. A short drag (for example 20px)
 * never arms.
 * @param {boolean} armed
 * @param {number} down pixels dragged down
 * @param {number} dx horizontal pixels from the start
 */
export function nextLockArmed(armed, down, dx) {
  if (!armed && down >= ARM_PX && down > Math.abs(dx) * LOCK_RATIO) return true;
  if (armed && down < DISARM_PX) return false;
  return armed;
}

/**
 * @param {string} code `KeyboardEvent.code`
 * @returns {number} 1–9, or 0 when the code is not a digit key
 */
export function digitFromCode(code) {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) : 0;
}

/**
 * @typedef {Object} PressView
 * @property {number} shown
 * @property {number} locked
 * @property {number} lastD
 * @property {number} lastT
 * @property {boolean} legacy
 */

/**
 * What the press itself does. Showing happens immediately; a double-tap fills
 * on the second press so the first press's highlight never flickers off.
 * @param {PressView} view
 * @param {number} d
 * @param {number} now
 */
export function classifyPress(view, d, now) {
  const dbl =
    !view.legacy && view.locked !== d && view.lastD === d && now - view.lastT <= DOUBLE_TAP_MS;
  return {
    dbl,
    fill: dbl,
    /** Highlight d on press. A locked pad waits until release. */
    show: !view.legacy && !dbl && view.locked === 0,
  };
}

/**
 * @typedef {Object} ReleaseView
 * @property {boolean} cancelled
 * @property {number} maxTravel
 * @property {number} elapsed
 * @property {number} toggled cells toggled by a second finger
 * @property {boolean} armLock
 * @property {boolean} armed swipe-up
 * @property {boolean} dbl
 * @property {boolean} legacy
 * @property {number} d
 * @property {number} wasLocked locked digit at press, or 0
 * @property {boolean} wasShown
 */

/**
 * How a finished key gesture commits. Swipe-down wins over swipe-up; a
 * two-finger hold wins over a tap. `ignore` leaves a show-on-press in place.
 * @param {ReleaseView} g
 * @returns {'cancel'|'lock'|'unlock-swipe'|'switch-lock'|'held'|'swipe-up'|'unlock-tap'|'show-other'|'legacy'|'show'|'hide-later'|'ignore'}
 */
export function classifyRelease(g) {
  if (g.cancelled) return "cancel";
  if (g.armLock) {
    if (g.wasLocked === g.d) return "unlock-swipe";
    if (g.wasLocked) return "switch-lock";
    return "lock";
  }
  if (g.toggled > 0) return "held";
  if (g.armed) return "swipe-up";
  const tap = g.maxTravel < TAP_MAX_TRAVEL && g.elapsed < TAP_MAX_MS;
  if (!tap) return "ignore";
  if (g.wasLocked && !g.dbl) return g.wasLocked === g.d ? "unlock-tap" : "show-other";
  if (g.legacy) return "legacy";
  if (g.dbl) return "ignore";
  if (g.wasShown) return "hide-later";
  return "show";
}
