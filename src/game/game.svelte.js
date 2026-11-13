// Reactive wrapper around the immutable game core. UI reads getters; actions
// apply ActionResults onto a snapshot history. Always Auto notes, matching master.
import { get } from "svelte/store";
import {
  newGame,
  singleCandidates,
  fillSingles as fillSinglesAction,
  setAnswer,
  toggleCandidate,
  erase,
  clearCell,
  valueAt,
  isGiven,
  isEditable,
  candidates,
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
import { bit, popcount } from "./board.js";
import { solvedState } from "./solved-state.js";
import { createCustomRecorder } from "../bank/custom-recorder.js";
import { createRecorder } from "../bank/recorder.js";
import { toSnapshot } from "./snapshot.js";
import { fromSnapshot } from "./snapshot.js";
import { done, timer, timerRunning, resetTimer, solvedPuzzles } from "../store.js";
import {
  puzzleProgress,
  replayProgress,
  customProgress,
  progressPayload,
} from "../journal/progress.js";

/** Demo puzzle shipped on master (the board you get by clicking Play). */
export const DEMO_PUZZLE =
  "050900000800040307000280190538607940020301000109804623907400000045000209000030070";

/**
 * @typedef {Object} LoadMeta
 * @property {boolean} [custom]
 * @property {string | null} [dateStr]
 * @property {string | null} [difficulty]
 */

/** @param {Parameters<typeof createRecorder>[0]} [bankOptions] */
export function createGame(bankOptions) {
  /** @type {ReturnType<typeof createRecorder> | null} */
  let bank = $state.raw(null);
  let customBank = $state.raw(/** @type {ReturnType<typeof createCustomRecorder> | null} */ (null));
  let stopBankTimer = () => {};
  const pendingBank = [];
  let history = $state(createHistory(newGame(DEMO_PUZZLE, { notesMode: "auto" })));
  let selected = $state(-1);
  let lastPlaced = $state(-1);
  /** Cells changed by a player digit commit; never restored history or loaded data.
   * @type {number[] | null} */
  let placement = $state(null);
  /** @type {{ dateStr: string | null, difficulty: string | null }} */
  let meta = $state({ dateStr: null, difficulty: null });
  let customKey = "";
  let marked = $state(false);
  let journalView = $state(false);
  let replaying = $state(false);
  let previousRecord = null;
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
  const conflictCells = $derived(conflicts(state));
  const candidateMasks = $derived(Array.from({ length: 81 }, (_, i) => candidates(state, i)));

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

  /** @param {import('./game.js').ActionResult} result @param {boolean} [feedback] */
  function apply(result, feedback = true) {
    if (isSolved(history.present)) return { state, changed: false, blockers: [] };
    prepareMutation();
    lastBlockers = result.blockers;
    if (!result.changed) return result;
    const placed = result.state.answers.flatMap((d, i) =>
      d && d !== history.present.answers[i] ? [i] : []
    );
    if (placed.length) lastPlaced = placed[placed.length - 1];
    placement = feedback && placed.length ? placed : null;
    history = commit(history, result);
    syncSolved();
    persistProgress();
    activity();
    return result;
  }

  function persistProgress(force = false, strict = false) {
    if (customBank) {
      customBank.save(toSnapshot(history.present), get(timer), isSolved(history.present));
      return;
    }
    if (bank) {
      bank.time(get(timer));
      bank.settings(history.present.notesMode);
      bank.save(toSnapshot(history.present), get(timer));
      return;
    }
    const store = customKey ? customProgress : replaying ? replayProgress : puzzleProgress;
    const date = customKey ? "puzzles" : meta.dateStr;
    const difficulty = customKey || meta.difficulty;
    if (!date || !difficulty) return;
    if (!store.isCurrent(date, difficulty)) {
      if (strict)
        throw new Error(
          "Could not verify saved progress. Storage may be unavailable or this puzzle changed in another tab."
        );
      return;
    }
    if (customKey) {
      const saved = store.save(date, difficulty, progressPayload(history.present, get(timer)));
      if (strict && !saved)
        throw new Error(
          "Could not verify saved progress. Storage may be unavailable or this puzzle changed in another tab."
        );
      return;
    }
    if (isSolved(history.present)) {
      if (!marked)
        marked = solvedPuzzles.markSolved(
          meta.dateStr,
          meta.difficulty,
          get(timer),
          replaying ? replayProgress : puzzleProgress
        );
      if (!marked) {
        if (strict) throw new Error("Could not save completion. Please retry.");
        return;
      }
      if (replaying) journalView = true;
      const cleared = store.clear(meta.dateStr, meta.difficulty);
      if (strict && !cleared) throw new Error("Could not save progress. Please retry.");
      return;
    }
    const elapsed = get(timer);
    const payload = progressPayload(history.present, elapsed);
    const saved = get(store)[meta.dateStr]?.[meta.difficulty]?.snapshot;
    const autoProgress =
      history.present.autoAdded.some(Boolean) || history.present.autoRemoved.some(Boolean);
    const savedAutoProgress =
      saved?.autoOverrides.added.some(Boolean) || saved?.autoOverrides.removed.some(Boolean);
    // First-second Auto and Tidy eliminations must persist. Undo must overwrite
    // their saved overrides/ledger rather than revive them after reload.
    if (
      !force &&
      payload.filled === 0 &&
      elapsed === 0 &&
      history.present.notesMode === "auto" &&
      !history.present.trustedEliminations &&
      !saved?.trustedEliminations &&
      !autoProgress &&
      !savedAutoProgress
    )
      return;
    const written = store.save(meta.dateStr, meta.difficulty, payload);
    if (strict && !written)
      throw new Error(
        "Could not verify saved progress. Storage may be unavailable or this puzzle changed in another tab."
      );
  }

  function syncSolved() {
    if (isSolved(history.present)) {
      done.set(true);
      if (bank) bank.complete(get(timer));
      if (!marked && meta.dateStr && meta.difficulty) {
        marked = solvedPuzzles.markSolved(
          meta.dateStr,
          meta.difficulty,
          get(timer),
          replaying ? replayProgress : puzzleProgress
        );
      }
      if (marked && replaying) journalView = true;
      if (marked && meta.dateStr && meta.difficulty)
        puzzleProgress.clear(meta.dateStr, meta.difficulty);
    } else {
      done.set(false);
    }
  }

  return {
    get bankMeta() {
      return bank?.meta ?? null;
    },
    /** Start a bank game. null resumes the selected saved attempt after reload.
     * @param {import('../bank/types.js').BankGameMeta | null} [bankMeta]
     * @param {string} [attemptId]
     */
    async startBank(bankMeta = null, attemptId) {
      // Complete the previous queue before reading its checkpoint for a new session.
      if (pendingBank.length) {
        try {
          await this.flushProgress(true);
        } catch {
          return false;
        }
      }
      const recorder = createRecorder(bankOptions);
      const saved = await recorder.open(bankMeta, attemptId);
      if (!saved) return false;
      this.load(
        saved.meta.puzzle.digits,
        "snapshot" in saved
          ? {
              snapshot: saved.snapshot,
              elapsed: saved.elapsed,
            }
          : {}
      );
      bank = recorder;
      pendingBank.push(recorder);
      recorder.begin(!bankMeta);
      syncSolved();
      persistProgress();
      stopBankTimer = timer.subscribe(() => persistProgress());
      await recorder.flush(true);
      return true;
    },
    get customTitle() {
      return customBank?.label ?? "Custom puzzle";
    },
    get customAttemptId() {
      return customBank?.attemptId ?? null;
    },
    /** Every Start makes a separate custom slot; Resume selects its exact ID.
     * @param {string} puzzle @param {string} [attemptId] @param {string} [label] */
    async startCustom(puzzle, attemptId, label) {
      await this.flushProgress(true);
      const recorder = createCustomRecorder(bankOptions);
      const saved = await recorder.open(attemptId, label);
      if (attemptId && (!saved || saved.completed)) return false;
      this.load(
        saved?.puzzle ?? puzzle,
        saved ? { snapshot: saved.snapshot, elapsed: saved.elapsed } : {}
      );
      customBank = recorder;
      pendingBank.push(recorder);
      persistProgress();
      stopBankTimer = timer.subscribe(() => persistProgress());
      await recorder.flush(true);
      return true;
    },
    /** Read-only saved solve; deriving the board must never create a new attempt.
     * @param {string} puzzle @param {number} time */
    viewBankSolve(puzzle, time) {
      this.load(puzzle);
      history = createHistory(solvedState(puzzle));
      journalView = true;
      marked = true;
      timer.set(time);
      done.set(true);
    },
    /** App lifecycle adapter; no-op for every non-bank game.
     * @param {'pause'|'resume'|'background'|'close'} type
     */
    bankLifecycle(type) {
      bank?.lifecycle(type, get(timer));
      if (bank) persistProgress();
    },
    bankHint() {
      bank?.hint();
    },
    get journalView() {
      return journalView;
    },
    get previousRecord() {
      return previousRecord;
    },
    get replaying() {
      return replaying;
    },
    /** Only the confirmed S3 action may replace an existing replay. @param {boolean} [startOver] */
    startReplay(startOver = false) {
      if (!journalView || !meta.dateStr || !meta.difficulty) return false;
      if (!replayProgress.isCurrent(meta.dateStr, meta.difficulty)) return false;
      const saved = get(replayProgress)[meta.dateStr]?.[meta.difficulty];
      if (saved && !startOver) return false;
      this.load(state.givens.join(""), { ...meta, replay: true });
      return true;
    },
    resumeReplay() {
      if (!journalView || !meta.dateStr || !meta.difficulty) return false;
      if (!replayProgress.isCurrent(meta.dateStr, meta.difficulty)) return false;
      const saved = get(replayProgress)[meta.dateStr]?.[meta.difficulty];
      if (!saved?.snapshot) return false;
      this.load(state.givens.join(""), {
        ...meta,
        replay: true,
        snapshot: saved.snapshot,
        elapsed: saved.elapsed,
      });
      return true;
    },
    get state() {
      return state;
    },
    get placement() {
      return placement;
    },
    get lastPlaced() {
      return lastPlaced;
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
      return !isSolved(history.present) && canUndo(history);
    },
    get canRedo() {
      return !isSolved(history.present) && canRedo(history);
    },
    get blockers() {
      return lastBlockers;
    },
    get singles() {
      return singleCandidates(state);
    },

    fillSingles() {
      prepareMutation();
      const result = fillSinglesAction(history.present);
      apply(result, false);
      if (!result.changed && state.notesMode === "auto") activity();
      return result;
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
      if (isSolved(history.present) && next) return;
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
      return candidateMasks[i];
    },
    /** @param {number} i @param {number} d */
    hasNote(i, d) {
      return (candidateMasks[i] & bit(d)) !== 0;
    },
    /** @param {number} i */
    noteCount(i) {
      return popcount(candidateMasks[i]);
    },
    /** @param {number} i */
    inConflict(i) {
      return conflictCells.has(i);
    },

    /** Selection does not restart the cue. @param {number} i */
    select(i) {
      if (isSolved(history.present) && i !== -1) return;
      prepareMutation();
      selected = i;
    },

    /** @param {import('./game.js').NotesMode} mode */
    setNotesMode(mode) {
      if (isSolved(history.present)) return;
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
     * Double-tap fill. In Auto only, a lone shown candidate (including
     * overrides) wins. Otherwise the focused digit is used in every mode.
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
      if (isSolved(history.present)) return { state, changed: false, blockers: [] };
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
      if (isSolved(history.present)) return;
      prepareMutation();
      if (!canUndo(history)) return;
      history = undoHistory(history);
      lastBlockers = [];
      syncSolved();
      persistProgress();
      activity();
    },
    redo() {
      if (isSolved(history.present)) return;
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
      if (replaying || journalView || (bank && isSolved(history.present))) return;
      prepareMutation();
      const next = restartState(state);
      const changed = changedCells(state, next).length > 0;
      history = createHistory(next);
      selected = -1;
      lastBlockers = [];
      marked = false;
      done.set(false);
      bank?.restartClock(get(timer));
      resetTimer();
      if (bank) persistProgress();
      if (meta.dateStr && meta.difficulty) puzzleProgress.clear(meta.dateStr, meta.difficulty);
      if (next.notesMode !== "auto") persistProgress(true);
      if (changed) activity();
    },

    /**
     * @param {string} puzzle
     * @param {LoadMeta & { replay?: boolean, snapshot?: import('./snapshot.js').Snapshot, elapsed?: number }} [info]
     */
    load(puzzle, info = {}) {
      prepareMutation();
      persistProgress();
      stopBankTimer();
      stopBankTimer = () => {};
      bank?.lifecycle("pause", get(timer));
      bank = null;
      customBank = null;
      customKey = info.custom ? puzzle : "";
      const record =
        info.dateStr && info.difficulty
          ? get(solvedPuzzles)[info.dateStr]?.[info.difficulty]
          : null;
      replaying = !!(info.replay && record?.completed);
      previousRecord = replaying ? record : null;
      journalView = !!record?.completed && !replaying;
      if (journalView) {
        history = createHistory(solvedState(puzzle));
      } else if (info.snapshot) {
        history = createHistory(fromSnapshot(info.snapshot));
      } else {
        history = createHistory(newGame(puzzle, { notesMode: "auto" }));
      }
      selected = -1;
      lastPlaced = -1;
      placement = null;
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
      if (journalView) {
        marked = true;
        timer.set(record.time);
        done.set(true);
      } else if (replaying && !info.snapshot && meta.dateStr && meta.difficulty) {
        replayProgress.save(meta.dateStr, meta.difficulty, progressPayload(history.present, 0));
      }
      onLoad();
    },

    /** Write current progress; explicit Update must reject a stale save.
     * @param {boolean} [strict]
     */
    flushProgress(strict = false) {
      persistProgress(false, strict);
      if (pendingBank.length)
        return Promise.all(pendingBank.map((recorder) => recorder.flush(strict))).then(() => {});
    },
  };
}

export const game = createGame();
