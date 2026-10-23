import { writable } from "svelte/store";
import { toSnapshot } from "../game/snapshot.js";

/**
 * Journal progress, stored at `sudoku-progress`.
 * @typedef {Object} ProgressEntry
 * @property {number} elapsed  seconds played
 * @property {number} filled   answers on non-given cells
 * @property {number} empty    non-given cells in the puzzle
 * @property {number} updatedAt
 * @property {import('../game/snapshot.js').Snapshot} [snapshot]  board so Resume can restore
 */

const SOLVED_KEY = "sudoku-solved";
const PROGRESS_KEY = "sudoku-progress";

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function createSolvedPuzzles() {
  const initial = readJson(SOLVED_KEY, {});
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    markSolved: (dateStr, difficulty, completionTime) => {
      update((solved) => {
        const next = { ...solved, [dateStr]: { ...(solved[dateStr] || {}) } };
        next[dateStr][difficulty] = {
          completed: true,
          time: completionTime,
          timestamp: Date.now(),
        };
        writeJson(SOLVED_KEY, next);
        return next;
      });
      puzzleProgress.clear(dateStr, difficulty);
    },
    isSolved: (dateStr, difficulty) => {
      let cur = {};
      subscribe((v) => (cur = v))();
      return !!cur?.[dateStr]?.[difficulty]?.completed;
    },
  };
}

function createPuzzleProgress() {
  const initial = readJson(PROGRESS_KEY, {});
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    /**
     * @param {string} dateStr
     * @param {string} difficulty
     * @param {Omit<ProgressEntry, 'updatedAt'>} entry
     */
    save: (dateStr, difficulty, entry) => {
      update((prog) => {
        const next = { ...prog, [dateStr]: { ...(prog[dateStr] || {}) } };
        next[dateStr][difficulty] = { ...entry, updatedAt: Date.now() };
        writeJson(PROGRESS_KEY, next);
        return next;
      });
    },
    clear: (dateStr, difficulty) => {
      update((prog) => {
        if (!prog[dateStr]?.[difficulty]) return prog;
        const day = { ...prog[dateStr] };
        delete day[difficulty];
        const next = { ...prog };
        if (Object.keys(day).length) next[dateStr] = day;
        else delete next[dateStr];
        writeJson(PROGRESS_KEY, next);
        return next;
      });
    },
  };
}

export const solvedPuzzles = createSolvedPuzzles();
export const puzzleProgress = createPuzzleProgress();

/**
 * How many of the empty cells have answers.
 * @param {import('../game/game.js').GameState} state
 */
export function fillCounts(state) {
  let empty = 0;
  let filled = 0;
  for (let i = 0; i < 81; i++) {
    if (state.givens[i]) continue;
    empty++;
    if (state.answers[i]) filled++;
  }
  return { empty, filled };
}

/**
 * @param {import('../game/game.js').GameState} state
 * @param {number} elapsed
 */
export function progressPayload(state, elapsed) {
  const { empty, filled } = fillCounts(state);
  return {
    elapsed,
    filled,
    empty,
    snapshot: toSnapshot(state),
  };
}
