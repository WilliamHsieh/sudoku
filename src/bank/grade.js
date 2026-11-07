// Sukaku Explainer Solver.java uses 20.0 for "Beyond solver". This is not L8.
// https://github.com/SudokuMonster/SukakuExplainer/blob/master/diuf/sudoku/solver/Solver.java
export const GRADER_FAILURE_TENTHS = Object.freeze([200]);
export const LEVEL_MIN = Object.freeze([10, 26, 32, 45, 56, 65, 70, 85]);
export const PRACTICE_HINTS = Object.freeze([
  "基礎定位",
  "鎖定與數對",
  "魚形與翼形",
  "唯一性與四數組",
  "高階模式與短鏈",
  "單數字／雙值鏈",
  "混合鏈與強制推理",
  "高階強制推理",
]);
/** Product grade, independent of source bucket. @param {number} tenths @returns {import('./types.js').Level} */
export function grade(tenths) {
  if (!Number.isSafeInteger(tenths) || tenths < 10 || GRADER_FAILURE_TENTHS.includes(tenths))
    throw new Error("Invalid rating tenths");
  return /** @type {import('./types.js').Level} */ (
    LEVEL_MIN.filter((min) => tenths >= min).length
  );
}
/** @param {import('./types.js').Level} level */
export function levelBand(level) {
  if (!Number.isInteger(level) || level < 1 || level > 8) throw new Error("Invalid level");
  return { min: LEVEL_MIN[level - 1], max: level === 8 ? Infinity : LEVEL_MIN[level] - 1 };
}
