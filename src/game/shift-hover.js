/**
 * One Shift-hover target. Cursor, box, and click all read this.
 * Null unless Shift is down, the pointer is over an empty cell, and that
 * 3×3 slot shows a candidate.
 */

/**
 * @param {{
 *   shift: boolean,
 *   cell: number,
 *   slot: number,
 *   filled: boolean,
 *   hasNote: boolean,
 * }} s
 * @returns {{ cell: number, slot: number, d: number } | null}
 */
export function resolveShiftHover(s) {
  if (!s.shift || s.cell < 0 || s.slot < 0 || s.filled || !s.hasNote) return null;
  return { cell: s.cell, slot: s.slot, d: s.slot + 1 };
}

/**
 * Opus `slotAt`: the 3×3 slot under the pointer, clamped to the cell.
 * Never snaps to the nearest visible candidate.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number} 0–8, or -1 if the cell has no size
 */
export function slotFromPoint(rect, clientX, clientY) {
  if (rect.width <= 0 || rect.height <= 0) return -1;
  const col = Math.min(2, Math.max(0, Math.floor(((clientX - rect.left) * 3) / rect.width)));
  const row = Math.min(2, Math.max(0, Math.floor(((clientY - rect.top) * 3) / rect.height)));
  return row * 3 + col;
}
