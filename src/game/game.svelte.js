// Reactive wrapper around the immutable game core. UI reads getters; actions
// apply ActionResults onto a snapshot history. Always Auto notes, matching master.
import { get } from 'svelte/store'
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
} from './game.js'
import { createHistory, commit, undo as undoHistory, redo as redoHistory, canUndo, canRedo } from './history.js'
import { popcount } from './board.js'
import { done, timer, timerRunning, resetTimer, solvedPuzzles } from '../store.js'

/** Demo puzzle shipped on master (the board you get by clicking Play). */
export const DEMO_PUZZLE =
  '050900000800040307000280190538607940020301000109804623907400000045000209000030070'

/**
 * @typedef {Object} LoadMeta
 * @property {string | null} [dateStr]
 * @property {string | null} [difficulty]
 */

export function createGame() {
  let history = $state(createHistory(newGame(DEMO_PUZZLE, { notesMode: 'auto' })))
  let selected = $state(-1)
  /** @type {{ dateStr: string | null, difficulty: string | null }} */
  let meta = $state({ dateStr: null, difficulty: null })
  let marked = $state(false)
  /** @type {number[]} */
  let lastBlockers = $state([])

  const state = $derived(history.present)

  /** @param {import('./game.js').ActionResult} result */
  function apply(result) {
    lastBlockers = result.blockers
    if (!result.changed) return result
    history = commit(history, result)
    syncSolved()
    return result
  }

  function syncSolved() {
    if (isSolved(history.present)) {
      done.set(true)
      if (!marked && meta.dateStr && meta.difficulty) {
        solvedPuzzles.markSolved(meta.dateStr, meta.difficulty, get(timer))
        marked = true
      }
    } else {
      done.set(false)
    }
  }

  return {
    get state() {
      return state
    },
    get selected() {
      return selected
    },
    get dateStr() {
      return meta.dateStr
    },
    get difficulty() {
      return meta.difficulty
    },
    get solved() {
      return isSolved(state)
    },
    get canUndo() {
      return canUndo(history)
    },
    get canRedo() {
      return canRedo(history)
    },
    get blockers() {
      return lastBlockers
    },

    /** @param {number} i */
    value(i) {
      return valueAt(state, i)
    },
    /** @param {number} i */
    given(i) {
      return isGiven(state, i)
    },
    /** @param {number} i */
    editable(i) {
      return isEditable(state, i)
    },
    /** @param {number} i */
    notes(i) {
      return candidates(state, i)
    },
    /** @param {number} i @param {number} d */
    hasNote(i, d) {
      return hasCandidate(state, i, d)
    },
    /** @param {number} i */
    noteCount(i) {
      return popcount(candidates(state, i))
    },
    /** @param {number} i */
    inConflict(i) {
      return conflicts(state).has(i)
    },

    /** @param {number} i */
    select(i) {
      selected = i
    },

    /** @param {number} i @param {number} d */
    enter(i, d) {
      return apply(setAnswer(state, i, d))
    },

    /** @param {number} i @param {number} d */
    toggleNote(i, d) {
      return apply(toggleCandidate(state, i, d))
    },

    /** @param {number} i */
    erase(i) {
      return apply(erase(state, i))
    },

    /**
     * Right-click semantics (Auto): an answer and its overrides go together;
     * an empty cell resets overrides. The UI still requires the cell selected.
     * @param {number} i
     */
    clear(i) {
      return apply(clearCell(state, i))
    },

    /** Typing 0: drop the answer only, keep note overrides. @param {number} i */
    clearAnswer(i) {
      const d = state.answers[i]
      if (!d) return { state, changed: false, blockers: [] }
      return apply(setAnswer(state, i, d))
    },

    undo() {
      if (!canUndo(history)) return
      history = undoHistory(history)
      lastBlockers = []
      syncSolved()
    },
    redo() {
      if (!canRedo(history)) return
      history = redoHistory(history)
      lastBlockers = []
      syncSolved()
    },

    /**
     * @param {string} puzzle
     * @param {LoadMeta} [info]
     */
    load(puzzle, info = {}) {
      history = createHistory(newGame(puzzle, { notesMode: 'auto' }))
      selected = -1
      meta = { dateStr: info.dateStr ?? null, difficulty: info.difficulty ?? null }
      marked = false
      lastBlockers = []
      done.set(false)
      resetTimer()
    },

    dismiss() {
      done.set(false)
      timerRunning.set(false)
    },
  }
}

export const game = createGame()
