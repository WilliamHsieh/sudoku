import { formatDay } from "../game/daily.js";

export const DIFFS = /** @type {const} */ (["easy", "medium", "hard"]);
export const DIFF_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const DIFF_LEVEL = { easy: 1, medium: 2, hard: 3 };

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const MONTHS3 = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** @param {string} s YYYY-MM-DD */
export function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** @param {string} s @param {number} n */
export function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return formatDay(d);
}

/** Journal times: m:ss, or h:mm:ss when ≥ 1 hour. */
export function fmtTime(sec) {
  const t = Math.round(Number(sec) || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  if (h) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** @param {string} s */
export function shortDate(s) {
  const d = parseDay(s);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS3[d.getMonth()]} ${d.getDate()}`;
}

/** @param {string} s */
export function longDate(s) {
  const d = parseDay(s);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** First of the month containing `dateStr`. @param {string} dateStr */
export function startOfMonth(dateStr) {
  const d = parseDay(dateStr);
  d.setDate(1);
  return d;
}
