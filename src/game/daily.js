/** Difficulty order for “first unsolved of the day”. */
export const DIFFICULTIES = ["easy", "medium", "hard"];

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function formatDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {string} today YYYY-MM-DD
 * @returns {string | null}
 */
export function latestPuzzleDay(puzzleData, today) {
  const dates = Object.keys(puzzleData)
    .filter((d) => d <= today)
    .sort();
  return dates[dates.length - 1] ?? null;
}

/**
 * First unsolved puzzle on `dateStr`, else the first available difficulty.
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {Record<string, Record<string, { completed?: boolean }>>} solved
 * @param {string} dateStr
 * @returns {{ dateStr: string, difficulty: string, puzzle: string } | null}
 */
export function firstUnsolvedPuzzle(puzzleData, solved, dateStr) {
  const puzzles = puzzleData[dateStr];
  if (!puzzles) return null;
  for (const difficulty of DIFFICULTIES) {
    if (puzzles[difficulty] && !solved?.[dateStr]?.[difficulty]?.completed) {
      return { dateStr, difficulty, puzzle: puzzles[difficulty] };
    }
  }
  for (const difficulty of DIFFICULTIES) {
    if (puzzles[difficulty]) {
      return { dateStr, difficulty, puzzle: puzzles[difficulty] };
    }
  }
  return null;
}

/**
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {Record<string, Record<string, { completed?: boolean }>>} solved
 * @param {Date} [now]
 */
export function firstUnsolvedLatest(puzzleData, solved, now = new Date()) {
  const day = latestPuzzleDay(puzzleData, formatDay(now));
  return day ? firstUnsolvedPuzzle(puzzleData, solved, day) : null;
}
