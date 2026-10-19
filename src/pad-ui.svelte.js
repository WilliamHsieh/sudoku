// Ephemeral keypad / undo-ring visuals. Not game state: Svelte reads these so
// classes survive a re-render (classList.add would be overwritten).

/**
 * @typedef {'add' | 'remove'} PreviewKind
 * @typedef {{ cell: number, d: number, kind: PreviewKind } | null} Preview
 * @typedef {{ cell: number, d: number } | null} PendingNote
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
});
