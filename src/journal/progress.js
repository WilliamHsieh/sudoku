import { mergeEntry } from "../persistence.js";
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
  const text = JSON.stringify(value);
  localStorage.setItem(key, text);
  if (localStorage.getItem(key) !== text) throw new Error("Could not verify saved progress");
}

function createSolvedPuzzles() {
  const initial = readJson(SOLVED_KEY, {});
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    markSolved: (dateStr, difficulty, completionTime) => {
      if (!puzzleProgress.isCurrent(dateStr, difficulty)) return;
      update((solved) => {
        solved = readJson(SOLVED_KEY, solved);
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

function createPuzzleProgress(key = PROGRESS_KEY) {
  const initial = readJson(key, {});
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
      let saved = false;
      update((prog) => {
        const current = readJson(key, prog);
        const next = mergeEntry(current, prog, dateStr, difficulty, {
          ...entry,
          updatedAt: Date.now(),
        });
        if (!next) return prog;
        writeJson(key, next);
        saved = true;
        return next;
      });
      return saved;
    },
    isCurrent: (dateStr, difficulty) => {
      let prog = {};
      subscribe((value) => {
        prog = value;
      })();
      const current = readJson(key, prog);
      return (
        JSON.stringify(current[dateStr]?.[difficulty]) ===
        JSON.stringify(prog[dateStr]?.[difficulty])
      );
    },
    clear: (dateStr, difficulty) => {
      update((prog) => {
        const current = readJson(key, prog);
        const next = mergeEntry(current, prog, dateStr, difficulty, null);
        if (!next) return prog;
        if (JSON.stringify(next) !== JSON.stringify(current)) writeJson(key, next);
        return next;
      });
    },
  };
}

export const solvedPuzzles = createSolvedPuzzles();
export const puzzleProgress = createPuzzleProgress();
export const customProgress = createPuzzleProgress("sudoku-custom-progress");

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
