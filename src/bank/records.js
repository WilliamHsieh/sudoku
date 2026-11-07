import { canonical } from "./random.js";
import { validateRecommendation } from "./recommendations.js";
import { validatePuzzle, validateSource } from "./catalog.js";

export const RECORDS_KEY = "sudoku-bank-records-v1";
export const RECORDS_SCHEMA = 1;
const modes = ["easy", "medium", "hard", "manual"];
const feedbacks = ["light", "some_effort", "struggle"];
const types = [
  "start",
  "time",
  "settings",
  "feedback",
  "pause",
  "background",
  "close",
  "resume",
  "hint",
  "reveal",
  "complete",
  "give_up",
];
/** @param {unknown} value */
function nonempty(value) {
  return typeof value === "string" && value.length > 0;
}
/** @param {unknown} settings */
function validateSettings(settings) {
  if (
    !settings ||
    typeof settings !== "object" ||
    Array.isArray(settings) ||
    !nonempty(settings["candidateMode"]) ||
    !Object.values(settings).every((v) => typeof v === "boolean" || typeof v === "string")
  )
    throw new Error("Invalid assistive settings");
}
/** @param {import('./types.js').Start} start */
function validateStart(start) {
  if (
    !start ||
    ![start.attemptId, start.playerId, start.catalogVersion, start.ruleVersion].every(nonempty) ||
    !modes.includes(start.mode) ||
    typeof start.replay !== "boolean" ||
    !start.reason ||
    !Array.isArray(start.reason.codes) ||
    !start.reason.codes.every(nonempty) ||
    !nonempty(start.reason.detail)
  )
    throw new Error("Invalid attempt");
  if (start.recommendation) {
    validateRecommendation(start.recommendation);
    const r = start.recommendation;
    if (
      r.puzzleId !== start.puzzle.id ||
      r.selectedRatingBucket !== start.puzzle.ratingTenths ||
      r.mode !== start.mode ||
      r.catalogVersion !== start.catalogVersion ||
      r.ruleVersion !== start.ruleVersion ||
      canonical(r.reason) !== canonical(start.reason)
    )
      throw new Error("Attempt recommendation mismatch");
  }
  validatePuzzle(start.puzzle);
  validateSource(start.source);
  validateSettings(start.settings);
}
/** @param {import('./types.js').Attempt} attempt */
export function isTerminal(attempt) {
  return attempt.outcome !== "in_progress" && attempt.outcome !== "paused";
}
/** Replay a versioned append-only log into one record per attempt. Event order is explicit;
 * wall time never adds play time. Unknown schemas and damaged entries fail closed.
 * @param {import('./types.js').RecordLog} log @returns {import('./types.js').Attempt[]} */
export function projectRecords(log) {
  if (!log || log.schema !== RECORDS_SCHEMA || !Array.isArray(log.events))
    throw new Error("Unsupported or invalid records schema");
  /** @type {Map<string, import('./types.js').Attempt>} */
  const attempts = new Map();
  const seen = new Map();
  for (const event of log.events) {
    if (
      !event ||
      !nonempty(event.id) ||
      !nonempty(event.attemptId) ||
      !Number.isSafeInteger(event.at) ||
      event.at < 0 ||
      !types.includes(event.type)
    )
      throw new Error("Invalid event");
    const key = JSON.stringify([event.attemptId, event.id]);
    const serialized = canonical(event);
    if (seen.has(key)) {
      if (seen.get(key) !== serialized) throw new Error("Conflicting event retry");
      continue;
    }
    seen.set(key, serialized);
    if (event.type === "start") {
      validateStart(event.start);
      if (event.start.attemptId !== event.attemptId || attempts.has(event.attemptId))
        throw new Error("Attempt already started or identity mismatch");
      // Derive replay as well as honoring explicit provenance. A caller cannot
      // accidentally upskill by giving a new attempt ID to a seen board.
      const replay =
        event.start.replay ||
        [...attempts.values()].some(
          (a) =>
            a.playerId === event.start.playerId &&
            (a.puzzle.id === event.start.puzzle.id || a.puzzle.digits === event.start.puzzle.digits)
        );
      attempts.set(event.attemptId, {
        ...structuredClone(event.start),
        replay,
        startedAt: event.at,
        updatedAt: event.at,
        effectiveMs: 0,
        hintUsed: false,
        answerRevealed: false,
        outcome: "in_progress",
        settingsHistory: [{ at: event.at, settings: structuredClone(event.start.settings) }],
      });
      continue;
    }
    const attempt = attempts.get(event.attemptId);
    if (!attempt) throw new Error("Unknown attempt");
    if (event.type === "feedback") {
      if (event.feedback !== undefined && !feedbacks.includes(event.feedback))
        throw new Error("Invalid feedback");
      if (!isTerminal(attempt)) throw new Error("Feedback requires a finished attempt");
    }
    // Re-sending completion under a new event ID must not create new evidence.
    if (isTerminal(attempt) && event.type === "complete") continue;
    if (event.at < attempt.updatedAt) throw new Error("Out-of-order event");
    if (isTerminal(attempt) && event.type !== "feedback") throw new Error("Attempt is finished");
    switch (event.type) {
      case "time":
        // A foreground clock supplies a cumulative value, flushed before pause.
        // Never infer activity from time between events (including app crashes).
        if (
          attempt.outcome !== "in_progress" ||
          !Number.isSafeInteger(event.effectiveMs) ||
          event.effectiveMs < attempt.effectiveMs
        )
          throw new Error("Invalid effective play time");
        attempt.effectiveMs = event.effectiveMs;
        break;
      case "settings":
        validateSettings(event.settings);
        attempt.settings = structuredClone(event.settings);
        attempt.settingsHistory.push({ at: event.at, settings: structuredClone(event.settings) });
        break;
      case "pause":
      case "background":
      case "close":
        attempt.outcome = "paused";
        break;
      case "resume":
        attempt.outcome = "in_progress";
        break;
      case "hint":
        attempt.hintUsed = true;
        break;
      case "reveal":
        attempt.answerRevealed = true;
        attempt.outcome = "viewed_answer";
        break;
      case "complete":
        attempt.outcome = attempt.hintUsed ? "hinted_complete" : "independent_complete";
        break;
      case "give_up":
        attempt.outcome = "gave_up";
        break;
      case "feedback":
        if (event.feedback === undefined) delete attempt.feedback;
        else attempt.feedback = event.feedback;
        break;
    }
    attempt.updatedAt = event.at;
    if (isTerminal(attempt) && attempt.endedAt === undefined) attempt.endedAt = event.at;
  }
  return [...attempts.values()];
}
/** Pure append: callers retain their previous value if validation fails.
 * @param {import('./types.js').RecordLog} log @param {import('./types.js').PlayEvent} event
 * @returns {import('./types.js').RecordLog} */
export function applyEvent(log, event) {
  const next = /** @type {import('./types.js').RecordLog} */ (
    structuredClone({ schema: log.schema, events: [...log.events, event] })
  );
  projectRecords(next);
  const exists = log.events.some((e) => e.attemptId === event.attemptId && e.id === event.id);
  return exists ? structuredClone(log) : next;
}
/** @param {Pick<import('./types.js').Storage, 'getItem'>} storage
 * @returns {{status: 'missing'|'ready', log: import('./types.js').RecordLog}|{status: 'unreadable', detail: string}} */
export function readRecords(storage) {
  try {
    const raw = storage.getItem(RECORDS_KEY);
    if (raw === null) return { status: "missing", log: { schema: 1, events: [] } };
    const log = JSON.parse(raw);
    projectRecords(log);
    return { status: "ready", log };
  } catch (error) {
    return {
      status: "unreadable",
      detail: error instanceof Error ? error.message : "Storage unavailable",
    };
  }
}
/** Read fresh for every write. No stale in-memory merge on failed reads.
 * The caller must serialize writers (e.g. one owner or a Web Lock across tabs).
 * @param {import('./types.js').Storage} storage @param {import('./types.js').PlayEvent} event */
export function saveEvent(storage, event) {
  const current = readRecords(storage);
  if (current.status === "unreadable") return { ok: false, code: "unreadable_storage" };
  try {
    const log = applyEvent(current.log, event);
    const text = JSON.stringify(log);
    storage.setItem(RECORDS_KEY, text);
    if (storage.getItem(RECORDS_KEY) !== text) return { ok: false, code: "write_not_verified" };
    return { ok: true, log };
  } catch (error) {
    return {
      ok: false,
      code: "event_or_write_failed",
      detail: error instanceof Error ? error.message : "Write failed",
    };
  }
}
