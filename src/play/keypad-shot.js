// Board + keypad fixture for the r2 review shots. Only runs when `?kp=` is set.
// Same demo puzzle and the same four filled cells as keypad-proto.html.
import { DEMO_PUZZLE } from "../game/game.svelte.js";
import { padUi } from "../pad-ui.svelte.js";
import { timer, timerRunning } from "../store.js";
import { showToast } from "../keypad-actions.js";
import { LABEL_HOLD, TOAST_NO_CELL, toastBlocked, toastLockedCell } from "../keypad-copy.js";

/** @param {number[]} grid */
function solve(grid) {
  const g = grid.slice();
  const row = (i) => Math.floor(i / 9);
  const col = (i) => i % 9;
  const box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
  /** @type {number[][]} */
  const peers = Array.from({ length: 81 }, (_, i) => {
    /** @type {number[]} */
    const p = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) p.push(j);
    }
    return p;
  });
  const ok = (i, d) => peers[i].every((p) => g[p] !== d);
  const go = () => {
    const i = g.indexOf(0);
    if (i < 0) return true;
    for (let d = 1; d <= 9; d++) {
      if (!ok(i, d)) continue;
      g[i] = d;
      if (go()) return true;
    }
    g[i] = 0;
    return false;
  };
  go();
  return g;
}

/**
 * @param {ReturnType<import('../game/game.svelte.js').createGame>} game
 * @param {number} d
 * @param {(i: number) => boolean} [pred]
 */
function firstWith(game, d, pred = () => true) {
  for (let i = 0; i < 81; i++) {
    if (!game.value(i) && game.hasNote(i, d) && pred(i)) return i;
  }
  return -1;
}

/** @param {number} i */
const boxOf = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

/**
 * @param {ReturnType<import('../game/game.svelte.js').createGame>} game
 * @param {string} name
 */
export function applyKeypadShot(game, name) {
  if (game.value(1) !== 5 || game.given(0)) game.load(DEMO_PUZZLE);
  const solved = solve(DEMO_PUZZLE.split("").map(Number));
  for (const i of [2, 22, 49, 60]) {
    if (!game.value(i)) game.fill(i, solved[i]);
  }
  game.discardHistory();
  game.select(-1);
  padUi.locked = 0;
  padUi.shown = 0;
  padUi.gesture = null;
  padUi.coach = false;
  timer.set(12 * 60 + 47);
  timerRunning.set(false);

  if (name === "digit-shown") padUi.shown = 5;
  if (name === "double-tap-filled") {
    const i = firstWith(game, 5, (cell) => Math.floor(cell / 9) > 3);
    if (i >= 0) {
      game.select(i);
      game.fill(i, 5);
      padUi.shown = 5;
    }
  }
  if (name === "locking") {
    padUi.shown = 5;
    padUi.gesture = {
      d: 5,
      pressed: true,
      holding: false,
      armed: false,
      armLock: true,
      remove: false,
      illegal: false,
      showLabel: false,
      label: "",
      bottom: "Release: lock",
    };
  }
  if (name === "locked" || name === "locked-hint" || name === "locked-blocked") {
    const sel = firstWith(game, 3);
    if (sel >= 0) game.select(sel);
    padUi.locked = 5;
    padUi.shown = 5;
    const a = firstWith(game, 5);
    const b = firstWith(game, 5, (cell) => cell !== a && boxOf(cell) === boxOf(a));
    if (a >= 0) game.toggleNote(a, 5);
    if (b >= 0) game.toggleNote(b, 5);
    padUi.ticks = {};
    padUi.ghosts = {};
    if (a >= 0) {
      padUi.ticks[a] = "remove";
      padUi.ghosts[a] = 5;
    }
    if (b >= 0) {
      padUi.ticks[b] = "remove";
      padUi.ghosts[b] = 5;
    }
    if (name === "locked-hint") showToast(toastLockedCell(5), true);
    if (name === "locked-blocked") {
      const blockers = game.noteBlockers(4, 5);
      padUi.blocked = blockers;
      showToast(toastBlocked(5), true);
    }
  }
  if (name === "holding") {
    const sel = firstWith(game, 3);
    if (sel >= 0) game.select(sel);
    padUi.shown = 5;
    const a = firstWith(game, 5);
    const b = firstWith(game, 5, (cell) => cell !== a && boxOf(cell) === boxOf(a));
    if (a >= 0) game.toggleNote(a, 5);
    if (b >= 0) game.toggleNote(b, 5, { merge: true });
    /** @type {Record<number, 'add' | 'remove'>} */
    const holds = {};
    /** @type {Record<number, number>} */
    const ghosts = {};
    if (a >= 0) {
      holds[a] = "remove";
      ghosts[a] = 5;
    }
    if (b >= 0) {
      holds[b] = "remove";
      ghosts[b] = 5;
    }
    padUi.holds = holds;
    padUi.holdGhosts = ghosts;
    padUi.gesture = {
      d: 5,
      pressed: true,
      holding: true,
      armed: false,
      armLock: false,
      remove: false,
      illegal: false,
      showLabel: true,
      label: LABEL_HOLD,
      bottom: "",
    };
  }
  if (name === "no-focus") {
    padUi.shown = 5;
    showToast(TOAST_NO_CELL, true);
  }
  if (name === "coach") padUi.coach = true;
}
