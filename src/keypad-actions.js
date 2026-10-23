// Keypad r2 actions shared by the keys, the board and the keyboard.
// Showing a digit does not touch the game, so it does not restart the cue.
// The highlighted digit is padUi.locked or padUi.shown. The selected cell's
// value is never a second source: selecting a filled cell copies its digit
// into `shown`, and clearing or switching that highlight drops the selection.

import {
  beginPaint,
  enterPaint,
  finishPaint,
  discardPaint,
  clearPaintMarks,
} from "./paint-actions.js";
import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import { HIDE_MS, TOAST_MS } from "./game/key-gesture.js";
import { TOAST_GIVEN, TOAST_NO_CELL } from "./keypad-copy.js";

/** @type {{ d: number, t: number, cell: number }} */
let lastKey = { d: 0, t: -Infinity, cell: -1 };
const NO_KEY = { d: 0, t: -Infinity, cell: -1 };
/** @type {ReturnType<typeof setTimeout> | 0} */
let hideTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let toastTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let blockedTimer = 0;

export function lastKeyPress() {
  return lastKey;
}

/** @param {{ d: number, t: number, cell?: number }} next */
export function setLastKeyPress(next) {
  lastKey = { cell: -1, ...next };
}

export function clearHideTimer() {
  clearTimeout(hideTimer);
  hideTimer = 0;
}

/**
 * Digit the keypad and the board both highlight. 0 = none.
 * Locked wins, then the shown digit. Selection does not contribute.
 */
export function focusedDigit() {
  return padUi.locked || padUi.shown || 0;
}

/**
 * Highlight d from a key press. Does not change the selection: a swipe still
 * needs the cell, and a tap decides at release. Tapping the digit that is
 * already shown hides it later, so the double-tap window keeps the cell.
 * @param {number} d
 */
export function showDigit(d) {
  if (padUi.locked) return;
  padUi.shown = d;
}

/**
 * A tap landed on d. `cell` is the selection from press time, kept for a
 * double-tap that fills after a switch. Switching from another digit drops
 * the selection. Hiding waits out the double-tap window, then drops it.
 * @param {{ d: number, t: number, cell: number, switched: boolean, hide: boolean }} tap
 */
export function finishDigitTap(tap) {
  setLastKeyPress({ d: tap.d, t: tap.t, cell: tap.cell });
  if (tap.hide) scheduleHide(tap.d);
  else if (tap.switched) clearKeypadSelection();
}

/**
 * A filled cell shows its digit. An empty cell leaves a keypad highlight up.
 * @param {number} i
 */
export function revealCellDigit(i) {
  if (padUi.locked || i < 0) return;
  const v = game.value(i);
  if (v) padUi.shown = v;
}

/**
 * After a keyboard digit or a legacy tap, the highlight matches the cell.
 * Clearing the answer turns the highlight off. Pressing 0 on an already
 * empty cell does not, so a keypad highlight stays.
 * @param {number} i
 * @param {number} before value before the write
 */
export function syncHighlightAfterEdit(i, before) {
  if (padUi.locked || i < 0) return;
  const v = game.value(i) || 0;
  if (v !== before || v) padUi.shown = v;
}

/** @param {number} d */
export function scheduleHide(d) {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideTimer = 0;
    if (padUi.shown !== d || padUi.locked) return;
    padUi.shown = 0;
    clearKeypadSelection();
  }, HIDE_MS);
}

/** @param {string} message @param {boolean} [sticky] */
export function showToast(message, sticky = false) {
  padUi.toast = message;
  clearTimeout(toastTimer);
  toastTimer = 0;
  if (sticky) return;
  toastTimer = setTimeout(() => {
    toastTimer = 0;
    padUi.toast = "";
  }, TOAST_MS);
}

export function clearToast() {
  clearTimeout(toastTimer);
  toastTimer = 0;
  padUi.toast = "";
}

/** @param {number[]} cells */
export function flashBlocked(cells) {
  clearTimeout(blockedTimer);
  padUi.blocked = cells;
  blockedTimer = setTimeout(() => {
    padUi.blocked = [];
    blockedTimer = 0;
  }, 300);
}

/** Clear selection without restarting the cue or blurring a held key. */
export function clearKeypadSelection() {
  if (game.selected >= 0) game.select(-1);
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.closest(".cell")) return;
  active.blur();
}

/** Keep keyboard selection; touch callers clear it separately. @param {number} d */
export function lockDigit(d) {
  discardPaint();
  padUi.locked = d;
  padUi.shown = d;
  lastKey = NO_KEY;
  clearHideTimer();
}

/** Unlock, leaving the digit highlighted. Not the start of a double-tap. */
export function unlockKeepShown() {
  discardPaint();
  if (!padUi.locked) return;
  const d = padUi.locked;
  padUi.locked = 0;
  padUi.shown = d;
  lastKey = NO_KEY;
  clearHideTimer();
}

/** Puzzle change, restart, reload: unlocked and nothing shown. */
export function resetKeypad() {
  padUi.locked = 0;
  padUi.shown = 0;
  lastKey = NO_KEY;
  clearHideTimer();
  clearToast();
  discardPaint();
  clearPaintMarks();
  padUi.gesture = null;
  padUi.hold = null;
  padUi.blocking = [];
  padUi.preview = null;
}

/**
 * Double-tap or screen-reader activation. Same digit again does not clear.
 * `cell` is the live selection, or the cell captured when switching digits
 * already cleared it. Does not select.
 * @param {number} d
 * @param {number} [cell]
 */
export function fillFocused(d, cell = game.selected) {
  const i = cell;
  if (i < 0) {
    showToast(TOAST_NO_CELL);
    return;
  }
  if (game.given(i)) {
    showToast(TOAST_GIVEN);
    flashBlocked([i]);
    return;
  }
  if (game.value(i) === d) return;
  game.fill(i, d);
}

/** Screen-reader / keyboard activation of a key. Always fills, no timing. @param {number} d */
export function activateKey(d) {
  fillFocused(d);
  if (!padUi.locked) padUi.shown = d;
}

/** Keyboard / assistive activation is a one-cell stroke. @param {number} i */
export function lockTap(i) {
  if (!padUi.locked) return;
  beginPaint(padUi.locked, "lock");
  enterPaint(i);
  finishPaint();
}

/** How many nines of d are already on the board. @param {number} d */
export function placedCount(d) {
  if (!d) return 0;
  let n = 0;
  for (let i = 0; i < 81; i++) if (game.value(i) === d) n += 1;
  return n;
}
