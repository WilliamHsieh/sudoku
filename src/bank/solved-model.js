import { solveResult, dayStreak } from "./player-api.js";
import { modeName } from "./ui-copy.js";
/** Result is frozen at completion; feedback and later games cannot change the cells.
 * @param {import('./types.js').Attempt[]} attempts @param {string} attemptId
 * @param {{maxOpenLevel: number, frontier?: import('./player-unlock.js').UnlockFrontier, perLevel?: Record<number, {hintFreeSolves:number}>}} previous
 */
export function bankSolvedModel(attempts, attemptId, previous) {
  const result = solveResult(attempts, attemptId, {
    previousMaxOpenLevel: previous.maxOpenLevel,
    frontier: previous.frontier,
  });
  const attempt = attempts.find((a) => a.attemptId === attemptId);
  const emh = ["easy", "medium", "hard"].includes(attempt.mode);
  const time = Math.floor(attempt.effectiveMs / 1000);
  const prior = attempts.filter(
    (a) =>
      a.attemptId !== attemptId &&
      a.puzzle.level === result.level &&
      a.endedAt <= attempt.endedAt &&
      ["independent_complete", "hinted_complete"].includes(a.outcome) &&
      !a.replay
  );
  const delta = prior.length
    ? Math.round(time - prior.reduce((sum, a) => sum + a.effectiveMs / 1000, 0) / prior.length)
    : null;
  const newBest =
    prior.length > 0 && time < Math.min(...prior.map((a) => Math.floor(a.effectiveMs / 1000)));
  const nextLevel = result.justUnlockedLevel ?? result.level;
  const third = emh
    ? { label: "puzzle level", value: `L${result.level}`, unlocked: false }
    : result.justUnlockedLevel
      ? { label: "unlocked", value: `L${result.justUnlockedLevel}`, unlocked: true }
      : result.level < previous.maxOpenLevel || result.level === 8
        ? {
            label: `L${result.level} solved`,
            value: String(result.levelSolvedDistinct),
            unlocked: false,
          }
        : {
            label: `unlock L${result.level + 1}`,
            value: `${attempt.replay ? (previous.perLevel?.[result.level]?.hintFreeSolves ?? result.hintFreeSolvesAtLevel) : result.hintFreeSolvesAtLevel}/${result.required}`,
            unlocked: false,
          };
  return {
    result,
    attemptId,
    time,
    delta,
    newBest,
    third,
    title: modeName(attempt.mode, result.level),
    streak: emh ? dayStreak(attempts, { now: attempt.endedAt }).current : 0,
    feeling: !attempt.hintUsed && !attempt.answerRevealed,
    feedback: attempt.feedback,
    nextMode: attempt.mode,
    nextLevel,
    label: `Next: ${emh ? modeName(attempt.mode, result.level) : `L${nextLevel}`}`,
  };
}
export function customSolvedModel(time) {
  return {
    result: null,
    attemptId: null,
    time,
    delta: null,
    newBest: false,
    third: null,
    title: "",
    streak: 0,
    feeling: false,
    feedback: undefined,
    nextMode: "manual",
    nextLevel: 3,
    label: "Next: L3",
  };
}
