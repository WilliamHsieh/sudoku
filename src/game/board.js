// Board geometry, digit bitmasks and puzzle parsing. Cells are indexed 0-80, row-major.

/** @param {number} i */
export const rowOf = (i) => Math.floor(i / 9);
/** @param {number} i */
export const colOf = (i) => i % 9;
/** @param {number} i */
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/**
 * For each cell, the 20 other cells sharing its row, column or box.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
export const PEERS = Object.freeze(
  Array.from({ length: 81 }, (_, i) => {
    const out = [];
    for (let j = 0; j < 81; j++) {
      if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) out.push(j);
    }
    return Object.freeze(out);
  }),
);

/** Candidate sets are bitmasks: bit d (1-9) set means digit d is in the set. */
export const ALL_DIGITS = 0b1111111110;

/** @param {number} d */
export const bit = (d) => 1 << d;

/** @param {number} mask @returns {number[]} the digits in the mask, ascending */
export function maskDigits(mask) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}

/** @param {Iterable<number>} digits */
export function digitsMask(digits) {
  let m = 0;
  for (const d of digits) m |= bit(d);
  return m;
}

/** @param {number} mask */
export function popcount(mask) {
  let n = 0;
  for (let m = mask; m; m >>= 1) n += m & 1;
  return n;
}

/** @param {unknown} i */
export const isCell = (i) => Number.isInteger(i) && /** @type {number} */ (i) >= 0 && /** @type {number} */ (i) < 81;

/** @param {unknown} d */
export const isDigit = (d) => Number.isInteger(d) && /** @type {number} */ (d) >= 1 && /** @type {number} */ (d) <= 9;

/**
 * Parses an 81-character puzzle string ('0' = empty) into a givens array.
 * @param {string} puzzle
 * @returns {number[]}
 */
export function parsePuzzle(puzzle) {
  if (typeof puzzle !== 'string' || !/^[0-9]{81}$/.test(puzzle)) {
    throw new Error('puzzle must be 81 digits (0 for empty)');
  }
  return [...puzzle].map(Number);
}
