// Reactive wrapper around the immutable game core. UI reads getters; actions
// apply ActionResults onto a snapshot history. Always Auto notes, matching master.
import { get } from "svelte/store";
import {
  newGame,
  setAnswer,
  toggleCandidate,
  erase,
  clearCell,
  valueAt,
  isGiven,
  isEditable,
  candidates,
  hasCandidate,
  conflicts,
  isSolved,
  setNotesMode as changeNotesMode,
  fill as fillLoneAction,
  eraseAction,
  blockersOf,
  isAdd,
} from "./game.js";
import {
  createHistory,
  commit,
  replace,
  undo as undoHistory,
  redo as redoHistory,
  canUndo,
  canRedo,
  changedCells,
} from "./history.js";
import { popcount } from "./board.js";
import { fromSnapshot } from "./snapshot.js";
import { done, timer, timerRunning, resetTimer, solvedPuzzles } from "../store.js";
import { puzzleProgress, progressPayload } from "../journal/progress.js";

/** Demo puzzle shipped on master (the board you get by clicking Play). */
export const DEMO_PUZZLE =
  "050900000800040307000280190538607940020301000109804623907400000045000209000030070";

/**
 * @typedef {Object} LoadMeta
 * @property {string | null} [dateStr]
 * @property {string | null} [difficulty]
 */

export function createGame() {
  let history = $state(createHistory(newGame(DEMO_PUZZLE, { notesMode: "auto" })));
  let selected = $state(-1);
  /** @type {{ dateStr: string | null, difficulty: string | null }} */
  let meta = $state({ dateStr: null, difficulty: null });
  let marked = $state(false);
  /** @type {number[]} */
  let lastBlockers = $state([]);
  /** @type {() => void} */
  let beforeMutate = () => {};

  const state = $derived(history.present);

  /**
   * Cells that undo/redo would change, and the cell the ring should land on.
   * @param {import('./game.js').GameState | undefined} other
   */
  function peek(other) {
    if (!other) return null;
    const cells = changedCells(state, other);
    const first = cells.includes(selected) ? selected : (cells[0] ?? -1);
    return { cells, first };
  }

  /** @param {import('./game.js').ActionResult} result */
  function apply(result) {
    beforeMutate();
    lastBlockers = result.blockers;
    if (!result.changed) return result;
    history = commit(history, result);
    syncSolved();
    persistProgress();
    return result;
  }

  function persistProgress() {
    if (!meta.dateStr || !meta.difficulty) return;
    if (isSolved(history.present)) {
      puzzleProgress.clear(meta.dateStr, meta.difficulty);
      return;
    }
    const elapsed = get(timer);
    const payload = progressPayload(history.present, elapsed);
    if (payload.filled === 0 && elapsed === 0) return;
    puzzleProgress.save(meta.dateStr, meta.difficulty, payload);
  }

  function syncSolved() {
    if (isSolved(history.present)) {
      done.set(true);
      if (!marked && meta.dateStr && meta.difficulty) {
        solvedPuzzles.markSolved(meta.dateStr, meta.difficulty, get(timer));
        marked = true;
      }
      if (meta.dateStr && meta.difficulty) puzzleProgress.clear(meta.dateStr, meta.difficulty);
    } else {
      done.set(false);
    }
  }

  return {
    get state() {
      return state;
    },
    get selected() {
      return selected;
    },
    get dateStr() {
      return meta.dateStr;
    },
    get difficulty() {
      return meta.difficulty;
    },
    get solved() {
      return isSolved(state);
    },
    get canUndo() {
      return canUndo(history);
    },
    get canRedo() {
      return canRedo(history);
    },
    get blockers() {
      return lastBlockers;
    },
    get notesMode() {
      return state.notesMode;
    },

    /** Flush a pending undo/redo ring before the next mutation. @param {() => void} [fn] */
    setBeforeMutate(fn) {
      beforeMutate = fn ?? (() => {});
    },

    /** @param {number} i */
    value(i) {
      return valueAt(state, i);
    },
    /** @param {number} i */
    given(i) {
      return isGiven(state, i);
    },
    /** @param {number} i */
    editable(i) {
      return isEditable(state, i);
    },
    /** @param {number} i */
    notes(i) {
      return candidates(state, i);
    },
    /** @param {number} i @param {number} d */
    hasNote(i, d) {
      return hasCandidate(state, i, d);
    },
    /** @param {number} i */
    noteCount(i) {
      return popcount(candidates(state, i));
    },
    /** @param {number} i */
    inConflict(i) {
      return conflicts(state).has(i);
    },

    /** @param {number} i */
    select(i) {
      beforeMutate();
      selected = i;
    },

    /** @param {import('./game.js').NotesMode} mode */
    setNotesMode(mode) {
      beforeMutate();
      history = replace(history, changeNotesMode(state, mode));
    },

    /** @param {number} i */
    eraseKind(i) {
      return eraseAction(state, i);
    },

    /**
     * Double-tap fill: the highlighted digit if it is a shown candidate, else
     * the cell's lone candidate. Auto mode only.
     * @param {number} i @param {number} [highlighted]
     */
    fillLone(i, highlighted = 0) {
      return apply(fillLoneAction(state, i, highlighted));
    },

    /** @param {number} i @param {number} d */
    noteBlockers(i, d) {
      return blockersOf(state, i, d);
    },
    /** @param {number} i @param {number} d */
    wouldAddNote(i, d) {
      return isAdd(state, i, d);
    },

    peekUndo() {
      return canUndo(history) ? peek(history.past[history.past.length - 1]) : null;
    },
    peekRedo() {
      return canRedo(history) ? peek(history.future[history.future.length - 1]) : null;
    },

    /** @param {number} i @param {number} d */
    enter(i, d) {
      return apply(setAnswer(state, i, d));
    },

    /**
     * Keyboard digits: write d. Same digit again is a no-op (master assignment,
     * not setAnswer's toggle). Shift-click still uses enter().
     * @param {number} i @param {number} d
     */
    fill(i, d) {
      if (state.answers[i] === d) return { state, changed: false, blockers: [] };
      return apply(setAnswer(state, i, d));
    },

    /** @param {number} i @param {number} d */
    toggleNote(i, d) {
      return apply(toggleCandidate(state, i, d));
    },

    /** @param {number} i */
    erase(i) {
      return apply(erase(state, i));
    },

    /**
     * Right-click semantics (Auto): an answer and its overrides go together;
     * an empty cell resets overrides. The UI still requires the cell selected.
     * @param {number} i
     */
    clear(i) {
      return apply(clearCell(state, i));
    },

    /** Typing 0: drop the answer only, keep note overrides. @param {number} i */
    clearAnswer(i) {
      const d = state.answers[i];
      if (!d) return { state, changed: false, blockers: [] };
      return apply(setAnswer(state, i, d));
    },

    undo() {
      beforeMutate();
      if (!canUndo(history)) return;
      history = undoHistory(history);
      lastBlockers = [];
      syncSolved();
      persistProgress();
    },
    redo() {
      beforeMutate();
      if (!canRedo(history)) return;
      history = redoHistory(history);
      lastBlockers = [];
      syncSolved();
      persistProgress();
    },

    /**
     * @param {string} puzzle
     * @param {LoadMeta & { snapshot?: import('./snapshot.js').Snapshot, elapsed?: number }} [info]
     */
    load(puzzle, info = {}) {
      beforeMutate();
      persistProgress();
      if (info.snapshot) {
        history = createHistory(fromSnapshot(info.snapshot));
      } else {
        history = createHistory(newGame(puzzle, { notesMode: "auto" }));
      }
      selected = -1;
      meta = { dateStr: info.dateStr ?? null, difficulty: info.difficulty ?? null };
      marked = false;
      lastBlockers = [];
      done.set(false);
      if (typeof info.elapsed === "number") {
        timer.set(info.elapsed);
        timerRunning.set(true);
      } else {
        resetTimer();
      }
    },

    /** Write current in-progress puzzle to `sudoku-progress`. */
    flushProgress() {
      persistProgress();
    },

    dismiss() {
      done.set(false);
      timerRunning.set(false);
    },
  };
}

export const game = createGame();
