import { DIFFS, DIFF_LABEL } from "./format.js";
import { latestPuzzleDay } from "../game/daily.js";

/**
 * @typedef {'solved' | 'progress' | 'none'} PuzzleKind
 * @typedef {{ kind: 'solved', time: number, timestamp: number }} SolvedState
 * @typedef {{ kind: 'progress', elapsed: number, filled: number, empty: number, updatedAt: number, pct: number, snapshot?: import('../game/snapshot.js').Snapshot }} ProgressState
 * @typedef {{ kind: 'none' }} NoneState
 * @typedef {SolvedState | ProgressState | NoneState} PuzzleState
 */

/**
 * @param {Record<string, Record<string, { completed?: boolean, time?: number, timestamp?: number }>>} solved
 * @param {Record<string, Record<string, { elapsed?: number, filled?: number, empty?: number, updatedAt?: number, snapshot?: unknown }>>} progress
 * @param {string} date
 * @param {string} d
 * @returns {PuzzleState}
 */
export function puzzleState(solved, progress, date, d) {
  const sol = solved?.[date]?.[d];
  if (sol?.completed) return { kind: "solved", time: sol.time ?? 0, timestamp: sol.timestamp ?? 0 };
  const p = progress?.[date]?.[d];
  if (p && typeof p.elapsed === "number") {
    const empty = p.empty || 1;
    const filled = p.filled ?? 0;
    return {
      kind: "progress",
      elapsed: p.elapsed,
      filled,
      empty,
      updatedAt: p.updatedAt ?? 0,
      pct: Math.round((100 * filled) / empty),
      snapshot: /** @type {import('../game/snapshot.js').Snapshot | undefined} */ (p.snapshot),
    };
  }
  return { kind: "none" };
}

/** @param {Record<string, Record<string, { completed?: boolean }>>} solved @param {string} date */
export function solvedCount(solved, date) {
  return DIFFS.filter((d) => solved?.[date]?.[d]?.completed).length;
}

/**
 * Streak = consecutive puzzle dates with ≥1 solve. Dates with no puzzle are skipped, not breaks.
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {Record<string, Record<string, { completed?: boolean }>>} solved
 * @param {string} latest
 */
export function streakFrom(puzzleData, solved, latest) {
  const dates = Object.keys(puzzleData)
    .filter((d) => d <= latest)
    .sort();
  if (!dates.length) return 0;
  /** @param {string} s */
  const hasSolve = (s) => DIFFS.some((d) => solved?.[s]?.[d]?.completed);
  let i = dates.length - 1;
  if (!hasSolve(dates[i])) i--;
  let n = 0;
  while (i >= 0 && hasSolve(dates[i])) {
    n++;
    i--;
  }
  return n;
}

/**
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {Record<string, Record<string, { completed?: boolean }>>} solved
 * @param {string} latest
 */
export function longestStreak(puzzleData, solved, latest) {
  const dates = Object.keys(puzzleData)
    .filter((d) => d <= latest)
    .sort();
  let best = 0;
  let cur = 0;
  for (const s of dates) {
    if (DIFFS.some((d) => solved?.[s]?.[d]?.completed)) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

/**
 * @param {Record<string, Record<string, { completed?: boolean, time?: number, timestamp?: number }>>} solved
 * @returns {Record<string, { time: number, date: string }>}
 */
export function personalBests(solved) {
  /** @type {Record<string, { time: number, date: string }>} */
  const b = {};
  for (const s in solved) {
    for (const d of DIFFS) {
      const e = solved[s]?.[d];
      if (!e?.completed) continue;
      if (!b[d] || e.time < b[d].time) b[d] = { time: e.time, date: s };
    }
  }
  return b;
}

/**
 * @param {Record<string, Record<string, { completed?: boolean, time?: number }>>} solved
 */
export function averages(solved) {
  /** @type {Record<string, number | null>} */
  const a = {};
  for (const d of DIFFS) {
    const ts = Object.values(solved)
      .map((x) => x[d]?.time)
      .filter((t) => typeof t === "number");
    a[d] = ts.length ? ts.reduce((p, c) => p + c, 0) / ts.length : null;
  }
  return a;
}

/**
 * Every in-progress puzzle, newest activity first.
 * @param {Record<string, Record<string, { elapsed?: number, filled?: number, empty?: number, updatedAt?: number, snapshot?: unknown }>>} progress
 * @param {Record<string, Record<string, { completed?: boolean, time?: number, timestamp?: number }>>} solved
 */
export function unfinishedList(progress, solved) {
  /** @type {Array<ProgressState & { date: string, diff: (typeof DIFFS)[number] }>} */
  const l = [];
  for (const s in progress) {
    for (const d of DIFFS) {
      const st = puzzleState(solved, progress, s, d);
      if (st.kind === "progress") l.push({ date: s, diff: d, ...st });
    }
  }
  return l.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {Record<string, Record<string, { completed?: boolean, time?: number, timestamp?: number }>>} solved
 * @param {Record<string, Record<string, { elapsed?: number, filled?: number, empty?: number, updatedAt?: number }>>} progress
 * @param {Date} view  first of the visible month
 * @param {string} [latest]  most recent puzzle day; future dates in the file are ignored
 */
export function monthStats(puzzleData, solved, progress, view, latest) {
  const y = view.getFullYear();
  const m = view.getMonth();
  const bs = personalBests(solved);
  const out = {
    tot: 0,
    unf: 0,
    days: 0,
    rows: /** @type {Record<string, { n: number, avg: number | null, best: { time: number, date: string } | null, allBest: { time: number, date: string } | null }>} */ ({}),
  };
  for (let i = 1; i <= 31; i++) {
    const dt = new Date(y, m, i);
    if (dt.getMonth() !== m) break;
    const s = `${y}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    if (puzzleData[s] && (!latest || s <= latest)) out.days++;
  }
  for (const d of DIFFS) {
    /** @type {number[]} */
    const ts = [];
    /** @type {{ time: number, date: string } | null} */
    let mb = null;
    for (let i = 1; i <= 31; i++) {
      const dt = new Date(y, m, i);
      if (dt.getMonth() !== m) break;
      const s = `${y}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      const st = puzzleState(solved, progress, s, d);
      if (st.kind === "solved") {
        ts.push(st.time);
        if (!mb || st.time < mb.time) mb = { time: st.time, date: s };
      }
      if (st.kind === "progress") out.unf++;
    }
    out.tot += ts.length;
    out.rows[d] = {
      n: ts.length,
      avg: ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : null,
      best: mb,
      allBest: bs[d] || null,
    };
  }
  return out;
}

/**
 * Calendar cells for `view` month.
 * @param {Record<string, Record<string, string>>} puzzleData
 * @param {string} latest
 * @param {string} today
 * @param {Date} view
 */
export function monthCells(puzzleData, latest, today, view) {
  const y = view.getFullYear();
  const m = view.getMonth();
  const first = new Date(y, m, 1).getDay();
  const n = new Date(y, m + 1, 0).getDate();
  /** @type {Array<null | { date: string, day: number, kind: 'puzzle' | 'nop' | 'future', notYet?: boolean }>} */
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let i = 1; i <= n; i++) {
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    if (date > latest) cells.push({ date, day: i, kind: "future", notYet: date <= today });
    else if (puzzleData[date]) cells.push({ date, day: i, kind: "puzzle" });
    else cells.push({ date, day: i, kind: "nop" });
  }
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < tail; i++) cells.push(null);
  return cells;
}

/**
 * @param {Record<string, Record<string, { completed?: boolean, time?: number, timestamp?: number }>>} solved
 * @param {Record<string, Record<string, { elapsed?: number, filled?: number, empty?: number, updatedAt?: number }>>} progress
 * @param {string} date
 */
export function dayDesc(solved, progress, date) {
  const label = { solved: "solved", progress: "in progress", none: "not solved" };
  return DIFFS.map(
    (d) => `${DIFF_LABEL[d]} ${label[puzzleState(solved, progress, date, d).kind]}`
  ).join(", ");
}

export { latestPuzzleDay };
