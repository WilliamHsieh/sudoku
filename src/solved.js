import { formatDay, latestPuzzleDay, firstUnsolvedPuzzle } from "./game/daily.js";
import { averages, streakFrom, puzzleState, unfinishedList } from "./journal/stats.js";
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
  // TODO(solved-design): Q3 — back-dated/custom primary targets await William's decision.
  const target = !dated || backdated ? todayTarget : (sameDay ?? resume);
  const label = !dated
    ? "Today's puzzle"
    : backdated
      ? `Today's puzzle${target ? `: ${DIFF_LABEL[target.difficulty]}` : ""}`
      : sameDay
        ? `Next: ${DIFF_LABEL[sameDay.difficulty]}`
        : target
          ? `Resume ${dateLabel(target.dateStr)} · ${DIFF_LABEL[target.difficulty]}`
          : "Journal";
  // TODO(solved-design): Q1 — drop a missing average and a zero streak; keep remaining columns equal.
  // TODO(solved-design): Q2 — slower values use +m:ss in ink; omit the personal-best slot.
  const comparison =
    delta == null
      ? ""
      : `${spokenTime(delta)} ${delta > 0 ? "slower" : "faster"} than your ${DIFF_LABEL[difficulty]} average`;
  return {
    dated,
    difficulty,
    time,
    delta,
    streak,
    kinds,
    count,
    dayLabel: backdated ? dateLabel(date) : "today",
    target,
    label,
    resume: !!target && !sameDay && dated && !backdated,
    announcement: `Solved in ${spokenTime(time)}.${comparison ? ` ${comparison}.` : ""}${streak ? ` ${streak}-day streak.` : ""}`,
  };
}
