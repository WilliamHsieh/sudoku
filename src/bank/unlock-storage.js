import { mergeMaxOpenLevel } from "./unlock.js";
import {
  projectPlayerUnlock,
  validateUnlockFrontier,
  inferUnlockFrontier,
} from "./player-unlock.js";
import { readRecords, projectRecords } from "./records.js";
import { CALIBRATION as C } from "./calibration.js";
import { canonical } from "./random.js";
import { withBankLock } from "./write-lock.js";

export const UNLOCK_KEY = "sudoku-bank-unlock-v1";
/** @typedef {import('./player-unlock.js').UnlockFrontier} Frontier */
/** @typedef {import('./player-unlock.js').CompletionCursor} Cursor */
/** @typedef {{schema: 1, playerId: string, maxOpenLevel: number, frontier?: Frontier,
 * openings?: Record<number, Frontier>, observed?: Cursor}} UnlockSave */
/** @param {Frontier} boundary */
function time(boundary) {
  return boundary.at ?? boundary.after.endedAt;
}
/** Clock cutoffs exclude their entire millisecond, after all same-time cursors.
 * @param {Frontier} a @param {Frontier} b */
function boundaryOrder(a, b) {
  const delta = time(a) - time(b);
  if (delta) return delta;
  if (a.at !== undefined) return b.at !== undefined ? 0 : 1;
  if (b.at !== undefined) return -1;
  return order(a.after, b.after);
}
/** @param {{endedAt?: number, attemptId: string}} a @param {{endedAt?: number, attemptId: string}} b */
function order(a, b) {
  return (
    a.endedAt - b.endedAt || (a.attemptId < b.attemptId ? -1 : a.attemptId > b.attemptId ? 1 : 0)
  );
}
/** @param {import('./types.js').Attempt[]} attempts @returns {Cursor|undefined} */
function latest(attempts) {
  const a = attempts
    .filter((a) => Number.isSafeInteger(a.endedAt) && a.endedAt > 0 && a.endedAt >= a.startedAt)
    .sort(order)
    .at(-1);
  return a ? { endedAt: a.endedAt, attemptId: a.attemptId } : undefined;
}
/** @param {import('./types.js').Storage} storage @param {string} playerId
 * @returns {{status: 'missing'|'ok', state: UnlockSave|null}|{status: 'unreadable', detail: string}} */
export function readUnlockState(storage, playerId) {
  try {
    if (typeof playerId !== "string" || !playerId) throw new Error("Player ID required");
    const raw = storage.getItem(UNLOCK_KEY);
    if (raw === null) return { status: "missing", state: null };
    const state = JSON.parse(raw);
    if (state?.schema !== 1 || state.playerId !== playerId)
      throw new Error("Unsupported unlock schema or player mismatch");
    mergeMaxOpenLevel(state.maxOpenLevel, state.maxOpenLevel);
    if (state.frontier !== undefined) validateUnlockFrontier(state.frontier, state.maxOpenLevel);
    if (state.observed !== undefined)
      validateUnlockFrontier(
        { level: state.maxOpenLevel, after: state.observed },
        state.maxOpenLevel
      );
    if (state.openings !== undefined) {
      if (!state.openings || typeof state.openings !== "object" || Array.isArray(state.openings))
        throw new Error("Invalid unlock openings");
      /** @type {Frontier | undefined} */
      let previous;
      for (const key of Object.keys(state.openings).sort((a, b) => Number(a) - Number(b))) {
        const level = Number(key),
          boundary = state.openings[key];
        if (String(level) !== key || level > state.maxOpenLevel)
          throw new Error("Invalid unlock openings");
        validateUnlockFrontier(boundary, level);
        if (previous && boundaryOrder(boundary, previous) < 0)
          throw new Error("Non-monotonic unlock openings");
        previous = boundary;
      }
      if (state.frontier && previous && boundaryOrder(state.frontier, previous) < 0)
        throw new Error("Non-monotonic unlock frontier");
      if (
        state.frontier &&
        state.openings[state.maxOpenLevel] &&
        canonical(state.frontier) !== canonical(state.openings[state.maxOpenLevel])
      )
        throw new Error("Conflicting unlock boundary");
      state.frontier ??= state.openings[state.maxOpenLevel];
    }
    return { status: "ok", state };
  } catch (error) {
    return { status: "unreadable", detail: error instanceof Error ? error.message : "Read failed" };
  }
}

/** Every raised level receives an immutable boundary before the single verified write.
 * Legacy migration reads the authoritative bank event log under the same lock.
 * now is invoked only inside the lock for non-solve/policy openings; inject it in tests.
 * @param {import('./types.js').Storage} storage @param {import('./types.js').Attempt[]} attempts
 * @param {{playerId: string, locks: Pick<LockManager, 'request'> | null,
 * policy?: import('./unlock.js').UnlockPolicy, now?: () => number, openLevel?: number}} options
 * @returns {Promise<{ok: true, state: UnlockSave}|{ok: false, code: string, detail?: string}>} */
export async function persistUnlockState(
  storage,
  attempts,
  { playerId, locks, policy, now = Date.now, openLevel }
) {
  try {
    if (typeof playerId !== "string" || !playerId || attempts.some((a) => a.playerId !== playerId))
      return { ok: false, code: "invalid_player" };
    const snapshot = structuredClone(attempts),
      savedPolicy = structuredClone(policy);
    if (openLevel !== undefined) mergeMaxOpenLevel(openLevel, openLevel);
    return await withBankLock(locks, () => {
      const current = readUnlockState(storage, playerId);
      if (current.status === "unreadable")
        return { ok: false, code: "unreadable_storage", detail: current.detail };
      const previous = current.state?.maxOpenLevel ?? C.unlockInitialLevels;
      const requested = mergeMaxOpenLevel(
        previous,
        Math.max(openLevel ?? previous, savedPolicy?.unlockInitialLevels ?? C.unlockInitialLevels)
      );
      const openings = { ...current.state?.openings };
      let effectiveAttempts = snapshot;
      let frontier = current.state?.frontier ?? current.state?.openings?.[previous];
      if (frontier) openings[previous] ??= frontier;
      // A missing canonical log cannot authorize migration from a tab snapshot.
      if (
        current.state &&
        previous > C.unlockInitialLevels &&
        !frontier &&
        requested === previous
      ) {
        const records = readRecords(storage);
        if (records.status === "unreadable")
          return { ok: false, code: "unreadable_history", detail: records.detail };
        if (records.status === "missing") {
          if (!snapshot.some((a) => a.puzzle.level >= previous))
            return { ok: true, state: current.state };
          return { ok: false, code: "migration_history_required" };
        }
        const storedHistory = projectRecords(records.log).filter((a) => a.playerId === playerId);
        effectiveAttempts = storedHistory;
        frontier = inferUnlockFrontier(storedHistory, previous);
        openings[previous] ??= frontier;
      }
      const observed = latest(effectiveAttempts);
      const stamp = () => {
        const at = now();
        if (!Number.isSafeInteger(at) || at <= 0)
          throw new Error("A valid opening clock is required");
        const records = readRecords(storage);
        if (records.status === "unreadable") throw new Error("Unreadable bank history");
        const canonicalEnd = latest(
          projectRecords(records.log).filter((a) => a.playerId === playerId)
        );
        return Math.max(
          at,
          observed?.endedAt ?? 0,
          current.state?.observed?.endedAt ?? 0,
          canonicalEnd?.endedAt ?? 0,
          ...Object.values(openings).map(time)
        );
      };
      let baseline = previous;
      if (requested > previous) {
        const at = stamp();
        for (let level = previous + 1; level <= requested; level++)
          openings[level] ??= { level, at };
        baseline = requested;
        frontier = openings[baseline];
      }
      let derived = projectPlayerUnlock(
        effectiveAttempts,
        { maxOpenLevel: baseline, frontier, openings },
        savedPolicy
      );
      // A recalibration can cross a threshold using previously observed solves.
      // That level opens now, so old locked-level completions cannot cascade.
      if (current.state && requested === previous && derived.maxOpenLevel > previous) {
        const first = derived.openings[previous + 1];
        if (
          !current.state.observed ||
          (first?.after && order(first.after, current.state.observed) <= 0)
        ) {
          const level = previous + 1,
            at = stamp();
          openings[level] ??= { level, at };
          baseline = level;
          frontier = openings[level];
          derived = projectPlayerUnlock(
            effectiveAttempts,
            { maxOpenLevel: baseline, frontier, openings },
            savedPolicy
          );
        }
      }
      for (const [level, boundary] of Object.entries(derived.openings))
        if (Number(level) > previous) openings[Number(level)] ??= boundary;
      const maxOpenLevel = derived.maxOpenLevel;
      for (let level = previous + 1; level <= maxOpenLevel; level++) {
        if (!openings[level]) throw new Error("Opening boundary required for every raised level");
        validateUnlockFrontier(openings[level], level);
      }
      const state = { ...current.state, schema: /** @type {const} */ (1), playerId, maxOpenLevel };
      if (Object.keys(openings).length) {
        state.openings = openings;
        state.frontier = openings[maxOpenLevel];
      }
      if (observed && (!state.observed || order(observed, state.observed) > 0))
        state.observed = observed;
      if (canonical(current.state) === canonical(state)) return { ok: true, state };
      // Validate the complete payload before writing, including boundary monotonicity.
      const text = JSON.stringify(state);
      const checked = readUnlockState({ getItem: () => text, setItem: () => {} }, playerId);
      if (checked.status === "unreadable") throw new Error(checked.detail);
      storage.setItem(UNLOCK_KEY, text);
      if (storage.getItem(UNLOCK_KEY) !== text) return { ok: false, code: "write_not_verified" };
      return { ok: true, state };
    });
  } catch (error) {
    return {
      ok: false,
      code: "unlock_write_failed",
      detail: error instanceof Error ? error.message : "Write failed",
    };
  }
}
