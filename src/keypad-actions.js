// Keypad r2 actions shared by the keys, the board and the keyboard.
// Showing a digit does not touch the game, so it does not restart the cue.

import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import { TAP_MAX_TRAVEL } from "./game/pad.js";
import { HIDE_MS, LOCK_TICK_MS, TOAST_MS } from "./game/key-gesture.js";
import { TOAST_GIVEN, TOAST_NO_CELL, toastBlocked, toastLockedCell } from "./keypad-copy.js";

/** @type {{ d: number, t: number }} */
let lastKey = { d: 0, t: -Infinity };
/** @type {ReturnType<typeof setTimeout> | 0} */
let hideTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let toastTimer = 0;
/** @type {ReturnType<typeof setTimeout> | 0} */
let blockedTimer = 0;
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const tickTimers = new Map();

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

function clearTicks() {
  for (const timer of tickTimers.values()) clearTimeout(timer);
  tickTimers.clear();
  padUi.ticks = {};
  padUi.ghosts = {};
}

/**
 * @param {number} cell
 * @param {'add' | 'remove'} kind
 * @param {number} d
 */
function startTick(cell, kind, d) {
  padUi.ticks = { ...padUi.ticks, [cell]: kind };
  if (kind === "remove") padUi.ghosts = { ...padUi.ghosts, [cell]: d };
  else if (padUi.ghosts[cell]) {
    const next = { ...padUi.ghosts };
    delete next[cell];
    padUi.ghosts = next;
  }
  const prev = tickTimers.get(cell);
  if (prev) clearTimeout(prev);
  tickTimers.set(
    cell,
    setTimeout(() => {
      tickTimers.delete(cell);
      if (padUi.ticks[cell] === kind) {
        const next = { ...padUi.ticks };
        delete next[cell];
        padUi.ticks = next;
      }
      if (padUi.ghosts[cell] === d) {
        const next = { ...padUi.ghosts };
        delete next[cell];
        padUi.ghosts = next;
      }
    }, LOCK_TICK_MS)
  );
}

/** @param {number} d */
export function lockDigit(d) {
  padUi.locked = d;
  padUi.shown = d;
  lastKey = { d: 0, t: -Infinity };
  clearHideTimer();
}

/** Unlock, leaving the digit highlighted. Not the start of a double-tap. */
export function unlockKeepShown() {
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
  clearTicks();
  padUi.holds = {};
  padUi.holdGhosts = {};
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

/**
 * One-finger tap while a digit is locked. Selection stays put.
 * Each successful toggle is its own undo step.
 * @param {number} i
 */
export function lockTap(i) {
  const d = padUi.locked;
  if (!d) return;
  if (game.given(i) || game.value(i)) {
    showToast(toastLockedCell(d));
    return;
  }
  const result = game.toggleNote(i, d);
  if (!result.changed) {
    if (result.blockers.length) {
      flashBlocked(result.blockers);
      showToast(toastBlocked(d));
    }
    return;
  }
  startTick(i, game.hasNote(i, d) ? "add" : "remove", d);
}

/**
 * Second finger on a cell while a key is held. One undo step for the hold.
 * A tap counts only after the same 250 ms still hold that shows the label.
 * @param {number} i
 */
export function secondFingerToggle(i) {
  const hold = padUi.hold;
  const gesture = padUi.gesture;
  if (!hold || !gesture || gesture.d !== hold.d || !gesture.holding) return;
  if (hold.travel >= TAP_MAX_TRAVEL) return;
  const d = hold.d;
  const result = game.toggleNote(i, d, { merge: hold.toggled > 0 });
  if (!result.changed) {
    const cells = result.blockers.length ? result.blockers : [i];
    flashBlocked(cells);
    return;
  }
  hold.toggled += 1;
  const added = game.hasNote(i, d);
  padUi.holds = { ...padUi.holds, [i]: added ? "add" : "remove" };
  if (added) {
    if (padUi.holdGhosts[i]) {
      const next = { ...padUi.holdGhosts };
      delete next[i];
      padUi.holdGhosts = next;
    }
  } else {
    padUi.holdGhosts = { ...padUi.holdGhosts, [i]: d };
  }
}

export function clearHoldMarks() {
  padUi.holds = {};
  padUi.holdGhosts = {};
}

/** How many nines of d are already on the board. @param {number} d */
export function placedCount(d) {
  if (!d) return 0;
  let n = 0;
  for (let i = 0; i < 81; i++) if (game.value(i) === d) n += 1;
  return n;
}
