import { firstAttempts } from "./ability.js";
import { deriveUnlockState, mergeMaxOpenLevel } from "./unlock.js";
import { CALIBRATION as C } from "./calibration.js";

/** @typedef {{endedAt: number, attemptId: string}} CompletionCursor */
/** The stored level was open immediately AFTER this completion.
 * @typedef {{level: number, after: CompletionCursor, at?: never}|{level: number, at: number, after?: never}} UnlockFrontier */
/** Validated completions and persisted cursors share this order.
 * @param {{endedAt?: number, attemptId: string}} a @param {{endedAt?: number, attemptId: string}} b */
function order(a, b) {
  return (
    a.endedAt - b.endedAt || (a.attemptId < b.attemptId ? -1 : a.attemptId > b.attemptId ? 1 : 0)
  );
}
/** @param {import('./types.js').Attempt} a */
function hasEnd(a) {
  return Number.isSafeInteger(a.endedAt) && a.endedAt > 0 && a.endedAt >= a.startedAt;
}
/** Reject malformed opening boundaries on the storage write/read paths.
 * @param {UnlockFrontier} frontier @param {number} maxOpenLevel */
export function validateUnlockFrontier(frontier, maxOpenLevel) {
  mergeMaxOpenLevel(maxOpenLevel, maxOpenLevel);
  if (frontier?.level !== maxOpenLevel) throw new Error("Invalid unlock frontier");
  if (frontier.at !== undefined) {
    if (!Number.isSafeInteger(frontier.at) || frontier.at < 0 || frontier.after !== undefined)
      throw new Error("Invalid unlock frontier");
    return;
  }
  if (
    !Number.isSafeInteger(frontier.after?.endedAt) ||
    frontier.after.endedAt <= 0 ||
    typeof frontier.after.attemptId !== "string" ||
    !frontier.after.attemptId
  )
    throw new Error("Invalid unlock frontier");
}

/** @param {{endedAt?: number, attemptId: string}} attempt @param {UnlockFrontier} boundary
 * @param {boolean} [inclusive] */
function past(attempt, boundary, inclusive = false) {
  const delta =
    boundary.at !== undefined ? attempt.endedAt - boundary.at : order(attempt, boundary.after);
  return inclusive ? delta >= 0 : delta > 0;
}

/** Replay one player's solves with dated opening boundaries. Undated stored
 * maxima are ignored; only solve history can supply their unlock evidence.
 * @param {import('./types.js').Attempt[]} attempts
 * @param {{maxOpenLevel?: number, frontier?: UnlockFrontier, openings?: Record<number, UnlockFrontier>}} [stored]
 * @param {import('./unlock.js').UnlockPolicy} [policy] */
export function projectPlayerUnlock(attempts, stored = {}, policy = {}) {
  if (new Set(attempts.map((a) => a.playerId)).size > 1)
    throw new Error("Unlock attempts must belong to one player");
  if (stored.maxOpenLevel !== undefined)
    mergeMaxOpenLevel(stored.maxOpenLevel, stored.maxOpenLevel);
  const supplied = stored.frontier ?? stored.openings?.[stored.maxOpenLevel];
  if (supplied !== undefined) validateUnlockFrontier(supplied, stored.maxOpenLevel);
  stored = supplied ? { ...stored, frontier: supplied } : {};
  const state = deriveUnlockState([], policy);
  const originOnly =
    supplied?.at === 0 &&
    supplied.level === state.maxOpenLevel &&
    Object.values(stored.openings ?? {}).every(
      (boundary) => boundary.level <= state.maxOpenLevel && boundary.at === 0
    );
  const historyOnly = !supplied || originOnly ? deriveUnlockState(attempts, policy) : null;
  const maximum = Math.max(
    stored.maxOpenLevel ?? state.maxOpenLevel,
    policy.unlockMaxLevel ?? C.unlockMaxLevel
  );
  const storedLevel = mergeMaxOpenLevel(
    state.maxOpenLevel,
    stored.maxOpenLevel ?? state.maxOpenLevel
  );
  for (let level = 1; level <= maximum; level++)
    state.perLevel[level] ??= {
      independentSolves: 0,
      hintFreeSolves: 0,
      required: policy.unlockRequiredHintFreeSolves ?? C.unlockRequiredHintFreeSolves,
    };
  if (stored.frontier) validateUnlockFrontier(stored.frontier, stored.maxOpenLevel ?? storedLevel);
  const frontier = stored.frontier;
  const known = { ...stored.openings };
  if (stored.frontier) known[stored.frontier.level] = stored.frontier;
  for (const [key, value] of Object.entries(known)) validateUnlockFrontier(value, Number(key));
  const dated = Object.values(known).sort((a, b) => a.level - b.level);
  const completions = firstAttempts(attempts, attempts[0]?.playerId)
    .filter(
      (a) =>
        ["manual", "sequential"].includes(a.mode) &&
        a.outcome === "independent_complete" &&
        !a.answerRevealed &&
        hasEnd(a)
    )
    .sort(order);
  const credited = new Set();
  /** @type {Map<number, UnlockFrontier>} */
  const openings = new Map();
  let applied = !stored.frontier && storedLevel <= state.maxOpenLevel;
  for (const a of completions) {
    for (const boundary of dated)
      if (past(a, boundary))
        state.maxOpenLevel = mergeMaxOpenLevel(state.maxOpenLevel, boundary.level);
    if (!applied && frontier && past(a, frontier)) {
      state.maxOpenLevel = mergeMaxOpenLevel(state.maxOpenLevel, storedLevel);
      applied = true;
    }
    // A known stored opening prevents recalibration from crediting solves
    // completed before that level actually opened.
    if (!applied && a.puzzle.level >= storedLevel) continue;
    if (a.puzzle.level !== state.maxOpenLevel) continue;
    const counts = state.perLevel[state.maxOpenLevel];
    counts.independentSolves++;
    if (a.hintCount !== 0 || a.hintUsed) continue;
    counts.hintFreeSolves++;
    credited.add(a.attemptId);
    if (state.maxOpenLevel < maximum && counts.hintFreeSolves >= counts.required) {
      const next = state.maxOpenLevel + 1;
      if (known[next] && !past(a, known[next], true)) continue;
      state.maxOpenLevel = next;
      openings.set(
        next,
        known[next] ?? {
          level: next,
          after: { endedAt: a.endedAt, attemptId: a.attemptId },
        }
      );
    }
  }
  state.maxOpenLevel = mergeMaxOpenLevel(state.maxOpenLevel, storedLevel);
  return {
    ...(historyOnly ?? state),
    credited,
    openings: Object.fromEntries(openings),
    frontier:
      openings.get(state.maxOpenLevel) ??
      (frontier?.level === state.maxOpenLevel ? frontier : undefined),
  };
}
