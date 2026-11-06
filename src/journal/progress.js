import { mergeEntry } from "../persistence.js";
import { writable } from "svelte/store";
import { fromSnapshot, toSnapshot } from "../game/snapshot.js";

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

// Startup may use an empty view, but mutations must distinguish unreadable
// storage from an absent key. Never merge stale memory after a failed read.
function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? {} : JSON.parse(raw);
    const record = (item) => item && typeof item === "object" && !Array.isArray(item);
    if (!record(value)) return null;
    for (const group of Object.values(value)) {
      if (!record(group)) return null;
      for (const entry of Object.values(group)) {
        if (!record(entry)) return null;
        if ("snapshot" in entry) fromSnapshot(entry.snapshot);
      }
    }
    return value;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return true;
  try {
    const text = JSON.stringify(value);
    localStorage.setItem(key, text);
    return localStorage.getItem(key) === text;
  } catch {
    // Ordinary play stays in memory. Strict Update checks the returned result.
    return false;
  }
}

function createSolvedPuzzles() {
  const initial = readJson(SOLVED_KEY, {}) ?? {};
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    markSolved: (dateStr, difficulty, completionTime) => {
      if (!puzzleProgress.isCurrent(dateStr, difficulty)) return false;
      let saved = false;
      update((solved) => {
        const current = readJson(SOLVED_KEY, solved);
        if (!current) return solved;
        const next = { ...current, [dateStr]: { ...(current[dateStr] || {}) } };
        next[dateStr][difficulty] = {
          completed: true,
          time: completionTime,
          timestamp: Date.now(),
        };
        if (!writeJson(SOLVED_KEY, next)) return solved;
        saved = true;
        return next;
      });
      if (saved) puzzleProgress.clear(dateStr, difficulty);
      return saved;
    },
    isSolved: (dateStr, difficulty) => {
      let cur = {};
      subscribe((v) => (cur = v))();
      return !!cur?.[dateStr]?.[difficulty]?.completed;
    },
  };
}

function createPuzzleProgress(key = PROGRESS_KEY) {
  const initial = readJson(key, {}) ?? {};
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
        if (!current) return prog;
        const next = mergeEntry(current, prog, dateStr, difficulty, {
          ...entry,
          updatedAt: Date.now(),
        });
        if (!next) return prog;
        if (!writeJson(key, next)) return prog;
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
        !!current &&
        JSON.stringify(current[dateStr]?.[difficulty]) ===
          JSON.stringify(prog[dateStr]?.[difficulty])
      );
    },
    clear: (dateStr, difficulty) => {
      let saved = false;
      update((prog) => {
        const current = readJson(key, prog);
        if (!current) return prog;
        const next = mergeEntry(current, prog, dateStr, difficulty, null);
        if (!next) return prog;
        if (JSON.stringify(next) !== JSON.stringify(current) && !writeJson(key, next)) return prog;
        saved = true;
        return next;
      });
      return saved;
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
