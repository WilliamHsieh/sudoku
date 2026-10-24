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
  restart as restartState,
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
  /**
   * Restarts the cue idle clock. Board changes and Notes-mode switches only —
   * not selection, hovering, or an attempt that changes nothing.
   */
  /** @type {() => void} */
  let onActivity = () => {};
  /** A different puzzle was loaded. */
  /** @type {() => void} */
  let onLoad = () => {};

  function activity() {
    onActivity();
  }

  /** @type {import("./game.js").GameState | null} */
  let draft = $state(null);
  const state = $derived(draft ?? history.present);

  function prepareMutation() {
    beforeMutate();
    draft = null;
  }

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
    prepareMutation();
    lastBlockers = result.blockers;
    if (!result.changed) return result;
    history = commit(history, result);
    syncSolved();
    persistProgress();
    activity();
    return result;
  }

  function persistProgress(force = false) {
    if (!meta.dateStr || !meta.difficulty) return;
    if (isSolved(history.present)) {
      puzzleProgress.clear(meta.dateStr, meta.difficulty);
      return;
    }
    const elapsed = get(timer);
    const payload = progressPayload(history.present, elapsed);
    if (!force && payload.filled === 0 && elapsed === 0 && history.present.notesMode === "auto")
      return;
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

    /** Flush pending undo before taking the stroke baseline. */
    beginStroke() {
      prepareMutation();
      return history.present;
    },

    /** Draft updates never write history or saved progress. @param {import('./game.js').GameState | null} next */
    previewStroke(next) {
      draft = next;
    },

    /** @param {import('./game.js').GameState} next */
    commitStroke(next) {
      draft = null;
      return apply({ state: next, changed: next !== history.present, blockers: [] });
    },

    /** Flush a pending undo/redo ring before the next mutation. @param {() => void} [fn] */
    setBeforeMutate(fn) {
      beforeMutate = fn ?? (() => {});
    },

    /** Board changes and Notes-mode switches. @param {() => void} [fn] */
    setOnActivity(fn) {
      onActivity = fn ?? (() => {});
    },

    /** @param {() => void} [fn] */
    setOnLoad(fn) {
      onLoad = fn ?? (() => {});
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

    /** Selection does not restart the cue. @param {number} i */
    select(i) {
      prepareMutation();
      selected = i;
    },

    /** @param {import('./game.js').NotesMode} mode */
    setNotesMode(mode) {
      prepareMutation();
      const prev = history.present;
      const next = changeNotesMode(prev, mode);
      history = replace(history, next);
      if (next !== prev) {
        persistProgress(true);
        activity();
      }
    },

    /** @param {number} i */
    eraseKind(i) {
      return eraseAction(state, i);
    },

    /**
     * Double-tap fill. A lone shown candidate wins, even when a different
     * digit is focused. Otherwise a focused digit is entered. Uses shown
     * Manual notes or Auto candidates, including overrides.
     * @param {number} i @param {number} [highlighted]
     */
    fillLone(i, highlighted = 0) {
      return apply(fillLoneAction(history.present, i, highlighted));
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
      return apply(setAnswer(history.present, i, d));
    },

    /**
     * Keyboard digits: write d. Same digit again is a no-op (master assignment,
     * not setAnswer's toggle). Shift-click still uses enter().
     * @param {number} i @param {number} d
     */
    fill(i, d) {
      if (state.answers[i] === d) return { state, changed: false, blockers: [] };
      return apply(setAnswer(history.present, i, d));
    },

    /**
     * Toggle note d. `merge` folds the edit into the current undo step so one
     * two-finger hold is a single undo. The first toggle of a hold must not merge.
     * @param {number} i
     * @param {number} d
     * @param {{ merge?: boolean }} [opts]
     */
    toggleNote(i, d, opts = {}) {
      const result = toggleCandidate(history.present, i, d);
      prepareMutation();
      lastBlockers = result.blockers;
      if (!result.changed) return result;
      history = opts.merge ? replace(history, result.state) : commit(history, result);
      syncSolved();
      persistProgress();
      activity();
      return result;
    },

    /** Drop undo and redo without changing the board. Shot presets only. */
    discardHistory() {
      history = createHistory(state);
    },

    /** @param {number} i */
    erase(i) {
      return apply(erase(history.present, i));
    },

    /**
     * Right-click semantics (Auto): an answer and its overrides go together;
     * an empty cell resets overrides. The UI still requires the cell selected.
     * @param {number} i
     */
    clear(i) {
      return apply(clearCell(history.present, i));
    },

    /** Typing 0: drop the answer only, keep note overrides. @param {number} i */
    clearAnswer(i) {
      const d = state.answers[i];
      if (!d) return { state, changed: false, blockers: [] };
      return apply(setAnswer(history.present, i, d));
    },

    undo() {
      prepareMutation();
      if (!canUndo(history)) return;
      history = undoHistory(history);
      lastBlockers = [];
      syncSolved();
      persistProgress();
      activity();
    },
    redo() {
      prepareMutation();
      if (!canRedo(history)) return;
      history = redoHistory(history);
      lastBlockers = [];
      syncSolved();
      persistProgress();
      activity();
    },

    /** Clear answers, notes and undo/redo. Keeps the puzzle and the notes mode. */
    restart() {
      prepareMutation();
      const next = restartState(state);
      const changed = changedCells(state, next).length > 0;
      history = createHistory(next);
      selected = -1;
      lastBlockers = [];
      marked = false;
      done.set(false);
      resetTimer();
      if (meta.dateStr && meta.difficulty) puzzleProgress.clear(meta.dateStr, meta.difficulty);
      if (next.notesMode !== "auto") persistProgress(true);
      if (changed) activity();
    },

    /**
     * @param {string} puzzle
     * @param {LoadMeta & { snapshot?: import('./snapshot.js').Snapshot, elapsed?: number }} [info]
     */
    load(puzzle, info = {}) {
      prepareMutation();
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
      onLoad();
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
