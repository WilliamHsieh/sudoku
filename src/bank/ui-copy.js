import { PRACTICE_HINTS, LEVEL_MIN } from "./grade.js";
export const LEVELS = /** @type {import('./types.js').Level[]} */ ([1, 2, 3, 4, 5, 6, 7, 8]);
export const levelName = (level) => PRACTICE_HINTS[level - 1];
export const modeName = (mode, level) =>
  mode === "custom"
    ? "Custom puzzle"
    : ["manual", "sequential"].includes(mode)
      ? `L${level}`
      : mode[0].toUpperCase() + mode.slice(1);
export const ratingRange = (level) =>
  `評分 [${(LEVEL_MIN[level - 1] / 10).toFixed(1)}, ${level === 8 ? "+∞" : (LEVEL_MIN[level] / 10).toFixed(1)})`;
export function lockedMessage(level, highest, count) {
  if (level === highest + 1) return `再解 ${10 - count} 題 L${highest}，解鎖 L${level}`;
  const before = Array.from({ length: level - highest - 1 }, (_, i) => `L${highest + i + 1}`);
  return `先解鎖 ${before.join(" 和 ")}，才能玩 L${level}`;
}
