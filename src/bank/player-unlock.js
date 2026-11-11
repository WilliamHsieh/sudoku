import { firstAttempts } from "./ability.js";
import { deriveUnlockState, mergeMaxOpenLevel } from "./unlock.js";
import { CALIBRATION as C } from "./calibration.js";

/** @typedef {{endedAt: number, attemptId: string}} CompletionCursor */
/** The stored level was open immediately AFTER this completion.
 * @typedef {{level: number, after: CompletionCursor}} UnlockFrontier */
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
  if (
    frontier?.level !== maxOpenLevel ||
    !Number.isSafeInteger(frontier.after?.endedAt) ||
    frontier.after.endedAt <= 0 ||
    typeof frontier.after.attemptId !== "string" ||
    !frontier.after.attemptId
  )
    throw new Error("Invalid unlock frontier");
}

/** Replay the same first-solve rule with a dated, monotonic stored frontier.
 * Numeric-only legacy calls conservatively infer the boundary after the latest
 * lower-level finished attempt. Supply the saved frontier to keep it stable when
 * the player later returns to lower levels. With no lower-level history, only a
 * specified current target has known eligibility; persistence checkpoints the
 * existing history and starts future credit after that checkpoint.
 * @param {import('./types.js').Attempt[]} attempts
 * @param {{maxOpenLevel?: number, frontier?: UnlockFrontier, targetAttemptId?: string}} [stored]
 * @param {import('./unlock.js').UnlockPolicy} [policy] */
export function projectPlayerUnlock(attempts, stored = {}, policy = {}) {
  if (new Set(attempts.map((a) => a.playerId)).size > 1)
    throw new Error("Unlock attempts must belong to one player");
  const state = deriveUnlockState([], policy);
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
  const finished = attempts
    .filter((a) => hasEnd(a) && a.outcome !== "paused" && a.outcome !== "in_progress")
    .sort(order);
  const lower = finished.filter((a) => a.puzzle.level < storedLevel).at(-1);
  const inferred = lower ?? finished.at(-1);
  const frontier =
    stored.frontier ??
    (inferred && storedLevel > state.maxOpenLevel
      ? {
          level: storedLevel,
          after: { endedAt: inferred.endedAt, attemptId: inferred.attemptId },
        }
      : undefined);
  const unknownTarget = !stored.frontier && !lower ? stored.targetAttemptId : undefined;
  const completions = firstAttempts(attempts, attempts[0]?.playerId)
    .filter((a) => a.outcome === "independent_complete" && !a.answerRevealed && hasEnd(a))
    .sort(order);
  const credited = new Set();
  /** @type {Map<number, UnlockFrontier>} */
  const openings = new Map();
  let applied = storedLevel <= state.maxOpenLevel;
  for (const a of completions) {
    if (!applied && (a.attemptId === unknownTarget || (frontier && order(a, frontier.after) > 0))) {
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
      state.maxOpenLevel++;
      openings.set(state.maxOpenLevel, {
        level: state.maxOpenLevel,
        after: { endedAt: a.endedAt, attemptId: a.attemptId },
      });
    }
  }
  state.maxOpenLevel = mergeMaxOpenLevel(state.maxOpenLevel, storedLevel);
  return {
    ...state,
    credited,
    frontier:
      openings.get(state.maxOpenLevel) ??
      (frontier?.level === state.maxOpenLevel ? frontier : undefined),
  };
}
