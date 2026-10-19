import { DIFFS } from "../src/journal/format.js";

/** @param {string} s */
function pd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** @param {Date} d */
function ds(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** @param {string} s @param {number} n */
function addDays(s, n) {
  const d = pd(s);
  d.setDate(d.getDate() + n);
  return ds(d);
}

/** @param {number} seed */
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Mockup `buildHistory()` so screenshots can match the signed-off numbers.
 * Real `puzzleData` still has 2026-10-06 / 2026-09-12 (mockup treated those as no-puzzle).
 *
 * @param {'default' | 'many' | 'nounf' | 'empty'} scen
 * @param {string} [today]
 */
export function buildHistory(scen = "default", today = "2026-10-18") {
  const r = rng(20261018);
  /** @type {Record<string, Record<string, { completed: boolean, time: number, timestamp: number }>>} */
  const solved = {};
  /** @type {Record<string, Record<string, { elapsed: number, filled: number, empty: number, updatedAt: number }>>} */
  const progress = {};
  const RANGE = { easy: [185, 420], medium: [480, 1200], hard: [900, 2700] };
  const P = { easy: 0.9, medium: 0.72, hard: 0.42 };
  const skip = new Set(["2026-09-12", "2026-09-19", "2026-09-20", "2026-09-29", "2026-10-06"]);
  if (scen === "empty") return { solved, progress };

  for (let s = "2026-09-06"; s < today; s = addDays(s, 1)) {
    if (skip.has(s)) continue;
    const wkend = [0, 6].includes(pd(s).getDay());
    for (const d of DIFFS) {
      if (r() > P[d] + (wkend && d === "hard" ? 0.25 : 0)) continue;
      const [lo, hi] = RANGE[d];
      const t = Math.round(lo + Math.pow(r(), 1.4) * (hi - lo));
      const ts = pd(s);
      ts.setHours(7 + Math.floor(r() * 16), Math.floor(r() * 60));
      (solved[s] ??= {})[d] = { completed: true, time: t, timestamp: +ts };
    }
  }
  for (let s = "2026-10-07"; s < today; s = addDays(s, 1)) {
    if (!solved[s]) {
      const ts = pd(s);
      ts.setHours(21, 10);
      solved[s] = {
        easy: { completed: true, time: 251 + ((pd(s).getDate() * 37) % 140), timestamp: +ts },
      };
    }
  }
  /** @param {string} s @param {string} d @param {number} t @param {number} h */
  const pin = (s, d, t, h) => {
    const ts = pd(s);
    ts.setHours(h, 12);
    (solved[s] ??= {})[d] = { completed: true, time: t, timestamp: +ts };
  };
  pin("2026-10-02", "easy", 182, 8);
  pin("2026-09-27", "medium", 461, 22);
  pin("2026-10-11", "hard", 862, 23);
  for (const s in solved)
    for (const d of Object.keys(solved[s])) {
      const min = { easy: 182, medium: 461, hard: 862 }[d];
      if (min && solved[s][d].time < min) solved[s][d].time = min + 40;
    }
  if (solved["2026-10-15"]) delete solved["2026-10-15"].hard;
  const t0 = pd(today);
  t0.setHours(8, 41);
  solved[today] = { easy: { completed: true, time: 252, timestamp: +t0 } };
  const t1 = pd(today);
  t1.setHours(23, 32);
  progress[today] = { medium: { elapsed: 700, filled: 24, empty: 52, updatedAt: +t1 } };
  const t2 = pd("2026-10-15");
  t2.setHours(22, 50);
  progress["2026-10-15"] = { hard: { elapsed: 1325, filled: 34, empty: 56, updatedAt: +t2 } };
  for (const n of ["2026-09-12", "2026-10-06"]) {
    delete solved[n];
    delete progress[n];
  }
  if (scen === "many") {
    /** @param {string} d @param {string} df @param {number} el @param {number} f @param {number} h */
    const add = (d, df, el, f, h) => {
      const t = pd(d);
      t.setHours(h, 5);
      (progress[d] ??= {})[df] = { elapsed: el, filled: f, empty: 56, updatedAt: +t };
      if (solved[d]) delete solved[d][df];
    };
    add("2026-10-12", "medium", 640, 30, 21);
    add("2026-10-09", "hard", 1810, 41, 23);
    add("2026-10-03", "medium", 305, 12, 19);
    add("2026-09-27", "hard", 2240, 47, 22);
  }
  if (scen === "nounf") return { solved, progress: {} };
  return { solved, progress };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {ReturnType<typeof buildHistory>} history
 */
export async function seedHistory(page, history) {
  await page.addInitScript(({ solved, progress }) => {
    localStorage.setItem("sudoku-solved", JSON.stringify(solved));
    localStorage.setItem("sudoku-progress", JSON.stringify(progress));
  }, history);
}
