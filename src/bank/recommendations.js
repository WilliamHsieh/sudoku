import { validatePuzzle } from "./catalog.js";
import { canonical } from "./random.js";

export const RECOMMENDATIONS_KEY = "sudoku-bank-recommendations-v1";
/** @typedef {{id: string, playerId: string, at: number, snapshot: import('./select.js').Selection}} PickEvent */
/** @typedef {{schema: 1, events: PickEvent[]}} PickLog */
/** Validate stored snapshots without reclassifying them using later history.
 * @param {import('./types.js').Recommendation} snapshot */
export function validateRecommendation(snapshot) {
  if (
    !snapshot ||
    !["easy", "medium", "hard", "manual", "sequential"].includes(snapshot.mode) ||
    ![snapshot.catalogVersion, snapshot.ruleVersion, snapshot.historySnapshotVersion].every(
      (v) => typeof v === "string" && v.length
    ) ||
    !snapshot.candidateRange ||
    !Number.isSafeInteger(snapshot.candidateRange.min) ||
    !(snapshot.candidateRange.max === null || Number.isSafeInteger(snapshot.candidateRange.max)) ||
    !(
      snapshot.selectedRatingBucket === null || Number.isSafeInteger(snapshot.selectedRatingBucket)
    ) ||
    !(snapshot.puzzleId === null || /^[a-f0-9]{40}$/.test(snapshot.puzzleId)) ||
    typeof snapshot.fallbackUsed !== "boolean" ||
    !(
      typeof snapshot.seed === "string" ||
      (typeof snapshot.seed === "number" && Number.isFinite(snapshot.seed))
    ) ||
    !snapshot.reason ||
    !Array.isArray(snapshot.reason.codes) ||
    !snapshot.reason.codes.length ||
    !snapshot.reason.codes.every((c) => typeof c === "string" && c.length) ||
    typeof snapshot.reason.detail !== "string"
  )
    throw new Error("Invalid recommendation snapshot");
}
/** @param {PickLog} log */
function validateLog(log) {
  if (!log || log.schema !== 1 || !Array.isArray(log.events))
    throw new Error("Invalid recommendation schema");
  const ids = new Set();
  for (const e of log.events) {
    if (
      !e ||
      ![e.id, e.playerId].every((v) => typeof v === "string" && v.length) ||
      !Number.isSafeInteger(e.at) ||
      e.at < 0 ||
      ids.has(e.id)
    )
      throw new Error("Invalid recommendation event");
    ids.add(e.id);
    validateRecommendation(e.snapshot);
    const s = e.snapshot;
    if (s.status !== "selected" && s.status !== "exhausted_in_range")
      throw new Error("Invalid selection status");
    const puzzle = s.status === "selected" ? s.puzzle : s.fallbackPuzzle;
    if (s.status === "selected" && !puzzle) throw new Error("Missing selected puzzle");
    if (puzzle) {
      validatePuzzle(puzzle);
      if (
        puzzle.id !== s.puzzleId ||
        puzzle.ratingTenths !== s.selectedRatingBucket ||
        puzzle.ratingTenths < s.candidateRange.min ||
        (s.candidateRange.max !== null && puzzle.ratingTenths > s.candidateRange.max)
      )
        throw new Error("Recommendation snapshot mismatch");
    } else if (s.puzzleId !== null || s.selectedRatingBucket !== null)
      throw new Error("Unexpected puzzle identity");
  }
}
/** @param {Pick<import('./types.js').Storage, 'getItem'>} storage
 * @returns {{status: 'missing'|'ready', log: PickLog}|{status: 'unreadable'}} */
export function readRecommendations(storage) {
  try {
    const raw = storage.getItem(RECOMMENDATIONS_KEY);
    if (raw === null) return { status: "missing", log: { schema: 1, events: [] } };
    const log = JSON.parse(raw);
    validateLog(log);
    return { status: "ready", log };
  } catch {
    return { status: "unreadable" };
  }
}
/** Read fresh; serialize writers with the same owner/Web Lock as play records.
 * Retry identity is caller supplied and must remain the same for the same recommendation.
 * @param {import('./types.js').Storage} storage @param {PickEvent} event */
export function saveRecommendation(storage, event) {
  const current = readRecommendations(storage);
  if (current.status === "unreadable") return { ok: false, code: "unreadable_storage" };
  try {
    const prior = current.log.events.find((e) => e.id === event.id);
    if (prior && canonical(prior) !== canonical(event))
      throw new Error("Conflicting recommendation retry");
    const log = /** @type {PickLog} */ ({
      schema: 1,
      events: prior ? current.log.events : [...current.log.events, event],
    });
    validateLog(log);
    const text = JSON.stringify(log);
    storage.setItem(RECOMMENDATIONS_KEY, text);
    if (storage.getItem(RECOMMENDATIONS_KEY) !== text)
      return { ok: false, code: "write_not_verified" };
    return { ok: true };
  } catch {
    return { ok: false, code: "event_or_write_failed" };
  }
}
/** Only issued picks enter the recent window, in event order; no cross-player exclusions.
 * @param {PickLog} log @param {string} playerId */
export function recentPicks(log, playerId) {
  validateLog(log);
  return structuredClone(
    log.events
      .filter((e) => e.playerId === playerId && e.snapshot.status === "selected")
      .map((e) => e.snapshot)
  );
}
