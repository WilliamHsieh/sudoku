import { formatDay, latestPuzzleDay, firstUnsolvedPuzzle } from "./game/daily.js";
import {
  averages,
  personalBests,
  streakFrom,
  puzzleState,
  unfinishedList,
} from "./journal/stats.js";
import { DIFFS, DIFF_LABEL, MONTHS3, parseDay } from "./journal/format.js";

/** @param {number} seconds */
export function spokenTime(seconds) {
  const n = Math.abs(Math.round(seconds));
  const m = Math.floor(n / 60),
    s = n % 60;
  return [
    m ? `${m} minute${m === 1 ? "" : "s"}` : "",
    s || !m ? `${s} second${s === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
/** @param {string} date */
function dateLabel(date) {
  const d = parseDay(date);
  return `${MONTHS3[d.getMonth()]} ${d.getDate()}`;
}
/** Compact Resume date; only dates outside the current year need a year.
 * @param {string} date @param {Date} now */
export function resumeDateLabel(date, now) {
  const year = parseDay(date).getFullYear();
  return `${dateLabel(date)}${year === now.getFullYear() ? "" : `, ${year}`}`;
}
/** Snapshot the comparison before this solve; the completed record is already saved.
 * @param {{date: string | null, difficulty: string | null, time: number, solved: Record<string, Record<string, {completed?: boolean, time?: number}>>, progress: Parameters<typeof unfinishedList>[0], puzzles: Record<string, Record<string, string>>, now?: Date}} input
 */
export function solvedModel({
  date,
  difficulty,
  time,
  solved,
  progress,
  puzzles,
  now = new Date(),
}) {
  const dated = !!(date && difficulty && puzzles[date]?.[difficulty]);
  const prior = Object.fromEntries(
    Object.entries(solved).map(([day, entries]) => [
      day,
      Object.fromEntries(
        Object.entries(entries).filter(([diff]) => day !== date || diff !== difficulty)
      ),
    ])
  );
  const average = dated ? averages(prior)[difficulty] : null;
  const previousBest = dated ? personalBests(prior)[difficulty]?.time : undefined;
  const newBest = previousBest != null && time < previousBest;
  const delta = average == null ? null : Math.round(time - average);
  const latest = latestPuzzleDay(puzzles, formatDay(now));
  const streak = dated && latest ? streakFrom(puzzles, solved, latest) : 0;
  const kinds = dated ? DIFFS.map((d) => puzzleState(solved, progress, date, d).kind) : [];
  const count = kinds.filter((k) => k === "solved").length;
  const backdated = dated && date !== latest;
  const today = latest ? firstUnsolvedPuzzle(puzzles, solved, latest) : null;
  const todayTarget = today && !solved[today.dateStr]?.[today.difficulty]?.completed ? today : null;
  const sameDay = dated && !backdated ? todayTarget : null;
  const unfinished = unfinishedList(progress, solved).find((p) => puzzles[p.date]?.[p.diff]);
  const resume = unfinished
    ? {
        dateStr: unfinished.date,
        difficulty: unfinished.diff,
        puzzle: puzzles[unfinished.date][unfinished.diff],
      }
    : todayTarget;
  const target = !dated || backdated ? todayTarget : (sameDay ?? resume);
  const label = !target
    ? "Journal"
    : !dated || backdated
      ? `Today: ${DIFF_LABEL[target.difficulty]}`
      : sameDay
        ? `Next: ${DIFF_LABEL[sameDay.difficulty]}`
        : `Resume ${resumeDateLabel(target.dateStr, now)} · ${DIFF_LABEL[target.difficulty]}`;
  const comparison =
    delta == null
      ? ""
      : `${spokenTime(delta)} ${delta > 0 ? "slower" : "faster"} than your ${DIFF_LABEL[difficulty]} average`;
  return {
    dated,
    newBest,
    difficulty,
    time,
    delta,
    streak,
    kinds,
    count,
    dayLabel: backdated ? dateLabel(date) : "today",
    target,
    label,
    resumeDetail: label.startsWith("Resume ") ? label.slice(7) : "",
    resume: !!target && !sameDay && dated && !backdated,
    announcement: `Solved in ${spokenTime(time)}.${newBest ? " New best." : ""}${comparison ? ` ${comparison}.` : ""}${streak ? ` ${streak}-day streak.` : ""}`,
  };
}
