// Ephemeral keypad / undo-ring visuals. Not game state: Svelte reads these so
// classes survive a re-render (classList.add would be overwritten).

/**
 * @typedef {'add' | 'remove'} PreviewKind
 * @typedef {{ cell: number, d: number, kind: PreviewKind } | null} Preview
 * @typedef {{ cell: number, d: number } | null} PendingNote
 */

/**
 * @typedef {Object} KeyGestureView
 * @property {number} d
 * @property {boolean} pressed
 * @property {boolean} holding
 * @property {boolean} armed
 * @property {boolean} armLock
 * @property {boolean} remove
 * @property {boolean} illegal
 * @property {boolean} showLabel
 * @property {string} label
 * @property {string} bottom
 */

/**
 * Second finger while a key is held.
 * @typedef {Object} KeyHold
 * @property {number} d
 * @property {number} pid
 * @property {number} travel
 * @property {number} toggled
 * @property {boolean} painting
 */

export const padUi = $state({
  /** @type {{ i: number, t: number, hl: number }} */
  lastTap: { i: -1, t: -Infinity, hl: 0 },
  /** @type {Preview} */
  preview: null,
  /** @type {PendingNote} */
  pending: null,
  /** @type {number[]} */
  blocking: [],
  /** @type {number[]} */
  blocked: [],
  /** @type {number[]} */
  undoTargets: [],
  quiet: false,
  /** Digit highlighted from the keypad or a filled cell. 0 = none. */
  shown: 0,
  /** Locked digit. 0 = none. Never persisted. */
  locked: 0,
  /** Toast over the board, or "". */
  toast: "",
  /** @type {ReturnType<typeof import('./game/paint.js').strokeMarks> | null} */
  marks: null,
  finger: -1,
  announcement: "",
  commitId: 0,
  /** @type {KeyGestureView | null} */
  gesture: null,
  /** @type {KeyHold | null} */
  hold: null,
  /** First-run coach over the keypad. */
  coach: false,
  /** Digit whose glyph is hidden while it flies. 0 = none. */
  lifted: 0,
});
