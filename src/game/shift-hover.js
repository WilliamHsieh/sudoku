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
 * Which of the 9 candidate slots contains (clientX, clientY) in `rect`.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {number} clientX
 * @param {number} clientY
 * @returns {number} 0–8, or -1 if the point is outside the cell
 */
export function slotFromPoint(rect, clientX, clientY) {
  if (rect.width <= 0 || rect.height <= 0) return -1;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return -1;
  const gx = Math.min(2, Math.floor((x * 3) / rect.width));
  const gy = Math.min(2, Math.floor((y * 3) / rect.height));
  return gy * 3 + gx;
}
