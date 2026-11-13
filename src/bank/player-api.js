import { mergeMaxOpenLevel } from "./unlock.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { fixedLevelOrder, selectPuzzle } from "./select.js";
import { CALIBRATION as C } from "./calibration.js";

/** @typedef {import('./types.js').Attempt} Attempt */
/** @param {Attempt[]} attempts @param {string} [playerId] */
function onePlayer(attempts, playerId) {
  const players = new Set(attempts.map((a) => a.playerId));
  if (players.size > 1 || (playerId !== undefined && attempts.some((a) => a.playerId !== playerId)))
    throw new Error("Player API attempts must belong to one player");
}
/** @param {Attempt} a */
function completed(a) {
  return a.outcome === "independent_complete" || a.outcome === "hinted_complete";
}
/** @param {Attempt} a */
function unfinished(a) {
  return a.outcome === "in_progress" || a.outcome === "paused";
}
/** @param {Attempt} a */
function validEnd(a) {
  return Number.isSafeInteger(a.endedAt) && a.endedAt > 0 && a.endedAt >= a.startedAt;
}
/** Stable code-unit order, including equal completion timestamps.
 * @param {Attempt} a @param {Attempt} b */
function completionOrder(a, b) {
  return a.endedAt - b.endedAt || compareId(a.attemptId, b.attemptId);
}
/** @param {string} a @param {string} b */
function compareId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Result at this completion, unaffected by later completions or feedback.
 * previousMaxOpenLevel is the persisted high-water mark BEFORE this completion.
 * Replays and below-frontier solves carry zero unlock progress.
 * @param {Attempt[]} attempts @param {string} attemptId
 * @param {{previousMaxOpenLevel: number, frontier?: import("./player-unlock.js").UnlockFrontier}} options */
export function solveResult(attempts, attemptId, { previousMaxOpenLevel, frontier }) {
  onePlayer(attempts);
  mergeMaxOpenLevel(previousMaxOpenLevel, previousMaxOpenLevel);
  const target = attempts.find((a) => a.attemptId === attemptId);
  if (!target || !completed(target) || !validEnd(target))
    throw new Error("Solve result requires a completed attempt");
  // Keep unfinished first attempts: they still reserve their board. Hide only
  // future outcomes, not board identity, when replaying the unlock timeline.
  const through = attempts
    .filter((a) => a.startedAt <= target.endedAt)
    .map((a) =>
      validEnd(a) && completionOrder(a, target) > 0
        ? { ...a, outcome: /** @type {const} */ ("paused") }
        : a
    );
  const beforeAttempts = through.map((a) =>
    a.attemptId === attemptId
      ? { ...a, outcome: /** @type {const} */ ("paused"), endedAt: undefined }
      : a
  );
  const context = { maxOpenLevel: previousMaxOpenLevel, frontier };
  const before = projectPlayerUnlock(beforeAttempts, context);
  const after = projectPlayerUnlock(through, context);
  const level = target.puzzle.level;
  const highest = before.maxOpenLevel;
  const atFrontier = level === highest && !target.replay;
  const countsTowardUnlock = atFrontier && after.credited.has(attemptId);
  const hintFreeSolvesAtLevel = atFrontier
    ? Math.min(after.perLevel[level].hintFreeSolves, C.unlockRequiredHintFreeSolves)
    : 0;
  const solved = through.filter(
    (a) => completed(a) && validEnd(a) && !a.replay && a.puzzle.level === level
  );
  const levelSolvedDistinct = new Set(solved.map((a) => a.puzzle.digits)).size;
  return {
    level,
    mode: target.mode,
    countsTowardUnlock,
    hintFreeSolvesAtLevel,
    required: C.unlockRequiredHintFreeSolves,
    justUnlockedLevel:
      countsTowardUnlock && after.maxOpenLevel > highest ? after.maxOpenLevel : null,
    levelSolvedDistinct,
  };
}

/** Valid completions of one board (hinted solves included) in completion order.
 * `first` dates the board as solved; `latest` holds the saved time, because a
 * finished replay replaces the time even when slower. Unfinished, revealed and
 * abandoned replays never complete, so they leave both untouched. Records stay
 * append-only: this only selects among them.
 * @param {Attempt[]} history
 * @returns {{first: Attempt, latest: Attempt} | null} */
function solves(history) {
  const done = history.filter((a) => completed(a) && validEnd(a)).sort(completionOrder);
  return done.length ? { first: done[0], latest: done[done.length - 1] } : null;
}

/** The saved solve for one bank board, matched by exact ID or digits.
 * @param {Attempt[]} attempts @param {{id: string, digits: string}} puzzle */
export function savedSolve(attempts, puzzle) {
  return solves(
    attempts.filter((a) => a.puzzle.id === puzzle.id || a.puzzle.digits === puzzle.digits)
  );
}

/** Bank boards in the same fixed order used by manual selection. solvedAt is the
 * earliest completion by endedAt / attemptId; solveMs (and bestMs while a replay
 * is active) is the latest completion's time, so a finished replay replaces it.
 * No snapshot is required in this layer.
 * @param {import('./types.js').Catalog} catalog @param {Attempt[]} attempts
 * @param {import('./types.js').Level} level @param {{playerId: string}} options */
export function levelList(catalog, attempts, level, { playerId }) {
  onePlayer(attempts, playerId);
  if (typeof playerId !== "string" || !playerId) throw new Error("Player ID required");
  const order = fixedLevelOrder(catalog, level);
  // Index both exact identities; this also handles a board from another catalog.
  /** @type {Map<string, Attempt[]>} */
  const byBoard = new Map();
  for (const a of attempts) {
    for (const key of new Set([a.puzzle.id, a.puzzle.digits])) {
      const group = byBoard.get(key) ?? [];
      group.push(a);
      byBoard.set(key, group);
    }
  }
  const items = order.map((puzzle, i) => {
    const history = [
      ...new Set([...(byBoard.get(puzzle.id) ?? []), ...(byBoard.get(puzzle.digits) ?? [])]),
    ];
    const saved = solves(history);
    const active = history.some(unfinished);
    const state = saved ? (active ? "replaying" : "solved") : active ? "in_progress" : "unsolved";
    return {
      puzzle,
      index: i + 1,
      state,
      solvedAt: saved?.first.endedAt ?? null,
      solveMs: saved?.latest.effectiveMs ?? null,
      ...(state === "replaying" ? { bestMs: saved.latest.effectiveMs } : {}),
    };
  });
  const next = selectPuzzle({
    catalog,
    records: attempts,
    playerId,
    mode: "manual",
    level,
    seed: "level-list",
  });
  // Include the same explicit replay proposal on exhaustion. No proposal (all
  // boards active, or an empty level) has no Next position.
  const nextIndex = items.find((item) => item.puzzle.id === next.puzzleId)?.index ?? null;
  return {
    items,
    nextIndex,
    totals: {
      solved: items.filter((item) => item.solvedAt !== null).length,
      total: items.length,
      inProgress: items.filter((item) => item.state === "in_progress" || item.state === "replaying")
        .length,
    },
  };
}

/** Bank records only; a later UI layer merges Custom and legacy saves. This
 * describes unfinished attempts, not a promise that a save can be resumed.
 * @param {Attempt[]} attempts */
export function unfinishedList(attempts) {
  onePlayer(attempts);
  const items = attempts
    .filter(
      (a) => unfinished(a) && ["easy", "medium", "hard", "manual", "sequential"].includes(a.mode)
    )
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt || compareId(a.attemptId, b.attemptId))
    .map((a) => ({
      attemptId: a.attemptId,
      startedAt: a.startedAt,
      updatedAt: a.updatedAt,
      mode: a.mode,
      level: a.puzzle.level,
      effectiveMs: a.effectiveMs,
      replay: a.replay,
    }));
  return { items, count: items.length };
}

/** Consecutive local calendar days, not elapsed 24-hour periods. Future events
 * are ignored. The current run may end today or yesterday; longest spans history.
 * @param {Attempt[]} attempts @param {{now: number, timeZone?: string}} options */
export function dayStreak(attempts, { now, timeZone }) {
  onePlayer(attempts);
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Valid now timestamp required");
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (at) => {
    const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]));
    // The UTC value is a calendar-day ordinal, not the event's UTC day.
    return (
      Date.parse(`${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T00:00:00Z`) /
      86_400_000
    );
  };
  const today = day(now);
  const days = new Set(
    attempts
      .filter(
        (a) =>
          completed(a) &&
          !a.replay &&
          validEnd(a) &&
          a.endedAt <= now &&
          ["easy", "medium", "hard"].includes(a.mode)
      )
      .map((a) => day(a.endedAt))
  );
  let longest = 0,
    run = 0,
    previous = -Infinity;
  for (const value of [...days].sort((a, b) => a - b)) {
    run = value === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = value;
  }
  const todayDone = days.has(today);
  let current = 0;
  for (let value = todayDone ? today : today - 1; days.has(value); value--) current++;
  return { current, longest, todayDone };
}
