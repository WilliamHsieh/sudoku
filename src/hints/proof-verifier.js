// Independent semantic safety check. This solver NEVER chooses or explains a hint.
// Detectors supply the pattern; every effect must hold in every completion, not
// merely agree with one solution. A bounded/inconclusive check fails closed.
import { ALL_DIGITS, bit, isCell, isDigit, maskDigits, popcount } from "../game/board.js";
/** @typedef {{cell:number,digit:number}} Effect */
/** @typedef {{observeTitle:string,observe:string[],reasonTitle:string,reasoning:string[],conclusion:string[]}} Teaching */
/** @typedef {{techniqueId:string,premiseCells:number[],placements:Effect[],eliminations:Effect[],reason:string,teaching?:Teaching}} Step */
/** @param {readonly number[]} values */
export function legalMasks(values) {
  if (values.length !== 81 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 9))
    throw new Error("Invalid board");
  return values.map((v, i) => {
    if (v) return 0;
    let m = ALL_DIGITS;
    for (let j = 0; j < 81; j++)
      if (
        values[j] &&
        (Math.floor(i / 9) === Math.floor(j / 9) ||
          i % 9 === j % 9 ||
          (Math.floor(i / 27) === Math.floor(j / 27) &&
            Math.floor((i % 9) / 3) === Math.floor((j % 9) / 3)))
      )
        m &= ~bit(values[j]);
    return m;
  });
}
/** @param {readonly number[]} values @param {readonly number[]} masks @param {{nodes:number,limit:number}} budget @returns {boolean} */
export function hasCompletion(values, masks, budget = { nodes: 0, limit: 250000 }) {
  const rows = new Uint16Array(9),
    cols = new Uint16Array(9),
    boxes = new Uint16Array(9);
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9),
      c = i % 9,
      b = Math.floor(r / 3) * 3 + Math.floor(c / 3),
      v = values[i];
    if (!v) {
      cells.push(i);
      continue;
    }
    const m = bit(v);
    if ((rows[r] | cols[c] | boxes[b]) & m) return false;
    rows[r] |= m;
    cols[c] |= m;
    boxes[b] |= m;
  }
  /** @param {number} depth @returns {boolean} */
  function visit(depth) {
    if (++budget.nodes > budget.limit) throw new Error("Proof verification budget exceeded");
    if (depth === cells.length) return true;
    let best = depth,
      choices = 0,
      count = 10;
    for (let j = depth; j < cells.length; j++) {
      const i = cells[j],
        r = Math.floor(i / 9),
        c = i % 9,
        b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const m = masks[i] & ~(rows[r] | cols[c] | boxes[b]);
      const n = popcount(m);
      if (!n) return false;
      if (n < count) {
        best = j;
        count = n;
        choices = m;
        if (n === 1) break;
      }
    }
    [cells[depth], cells[best]] = [cells[best], cells[depth]];
    const i = cells[depth],
      r = Math.floor(i / 9),
      c = i % 9,
      b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    for (let m = choices; m; m &= m - 1) {
      const v = m & -m;
      rows[r] |= v;
      cols[c] |= v;
      boxes[b] |= v;
      const found = visit(depth + 1);
      rows[r] &= ~v;
      cols[c] &= ~v;
      boxes[b] &= ~v;
      if (found) {
        [cells[depth], cells[best]] = [cells[best], cells[depth]];
        return true;
      }
    }
    [cells[depth], cells[best]] = [cells[best], cells[depth]];
    return false;
  }
  return visit(0);
}
/** Reject malformed candidate states before searching. @param {readonly number[]} values @param {readonly number[]} masks */
export function validateMasks(values, masks) {
  const legal = legalMasks(values);
  if (
    masks.length !== 81 ||
    masks.some((m, i) => !Number.isInteger(m) || m < 0 || m & ~legal[i] || (!values[i] && !m))
  )
    throw new Error("Invalid candidate state");
}
/** @param {readonly number[]} values @param {readonly number[]} masks @param {Step} step @param {{nodes:number,limit:number}} [budget] */
export function verifyStep(values, masks, step, budget = { nodes: 0, limit: 250000 }) {
  validateMasks(values, masks);
  if (!hasCompletion(values, masks, budget)) throw new Error("Board has no completion");
  if (
    !step ||
    !Array.isArray(step.placements) ||
    !Array.isArray(step.eliminations) ||
    (!step.placements.length && !step.eliminations.length)
  )
    throw new Error("Empty proof");
  const occupied = new Set();
  for (const { cell, digit } of [...step.placements, ...step.eliminations])
    if (!isCell(cell) || !isDigit(digit) || values[cell] || !(masks[cell] & bit(digit)))
      throw new Error("Invalid proof effect");
  for (const { cell, digit } of step.placements) {
    if (occupied.has(cell)) throw new Error("Duplicate placement");
    occupied.add(cell);
    const alternative = [...masks];
    alternative[cell] &= ~bit(digit);
    if (hasCompletion(values, alternative, budget)) throw new Error("Unproved placement");
  }
  for (const { cell, digit } of step.eliminations) {
    if (step.placements.some((p) => p.cell === cell && p.digit === digit))
      throw new Error("Conflicting proof");
    const forced = [...masks];
    forced[cell] = bit(digit);
    if (hasCompletion(values, forced, budget)) throw new Error("Unproved elimination");
  }
  return true;
}
/** Certify persisted eliminations against original legal candidates, never against themselves.
 * @param {readonly number[]} values @param {readonly number[]} removed
 */
export function verifyLedger(values, removed) {
  const masks = legalMasks(values);
  if (
    removed.length !== 81 ||
    removed.some((m) => !Number.isInteger(m) || m < 0 || m & ~ALL_DIGITS)
  )
    throw new Error("Invalid elimination ledger");
  const eliminations = removed.flatMap((m, cell) =>
    maskDigits(m & masks[cell]).map((digit) => ({ cell, digit }))
  );
  if (eliminations.length)
    verifyStep(values, masks, {
      techniqueId: "ledger",
      premiseCells: [],
      placements: [],
      eliminations,
      reason: "",
    });
  return masks.map((m, i) => m & ~removed[i]);
}
