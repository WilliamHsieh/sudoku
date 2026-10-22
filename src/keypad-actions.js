// Keypad r2 actions shared by the keys, the board and the keyboard.
// Showing a digit does not touch the game, so it does not restart the cue.

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

/** @type {{ d: number, t: number }} */
let lastKey = { d: 0, t: -Infinity };
/** @type {ReturnType<typeof setTimeout> | 0} */
let hideTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let toastTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let blockedTimer = 0;

export function lastKeyPress() {
  return lastKey;
}

/** @param {{ d: number, t: number }} next */
export function setLastKeyPress(next) {
  lastKey = next;
}

export function clearHideTimer() {
  clearTimeout(hideTimer);
  hideTimer = 0;
}

/** @param {number} d */
export function scheduleHide(d) {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    hideTimer = 0;
    if (padUi.shown === d && !padUi.locked) padUi.shown = 0;
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

/** @param {number} d */
export function lockDigit(d) {
  discardPaint();
  padUi.locked = d;
  padUi.shown = d;
  lastKey = { d: 0, t: -Infinity };
  clearHideTimer();
}

/** Unlock, leaving the digit highlighted. Not the start of a double-tap. */
export function unlockKeepShown() {
  discardPaint();
  if (!padUi.locked) return;
  const d = padUi.locked;
  padUi.locked = 0;
  padUi.shown = d;
  lastKey = { d: 0, t: -Infinity };
  clearHideTimer();
}

/** Puzzle change, restart, reload: unlocked and nothing shown. */
export function resetKeypad() {
  padUi.locked = 0;
  padUi.shown = 0;
  lastKey = { d: 0, t: -Infinity };
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
 * @param {number} d
 */
export function fillFocused(d) {
  const i = game.selected;
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
