import { RECORDS_KEY } from "./records.js";
/** Store synthetic completed attempts as their authoritative schema-1 event log.
 * The event log remains available even when an unlock checkpoint write fails.
 * @param {import('./types.js').Storage} storage @param {import('./types.js').Attempt[]} attempts */
export function storeCompletedAttempts(storage, attempts) {
  /** @type {import('./types.js').PlayEvent[]} */
  const events = [];
  for (const a of attempts) {
    if (a.outcome !== "independent_complete" || a.hintCount !== 0)
      throw Error("Completed fixture required");
    const {
      attemptId,
      playerId,
      puzzle,
      catalogVersion,
      source,
      mode,
      ruleVersion,
      reason,
      replay,
      settings,
    } = a;
    const start = {
      attemptId,
      playerId,
      puzzle,
      catalogVersion,
      source,
      mode,
      ruleVersion,
      reason,
      replay,
      settings,
    };
    events.push({ id: "start", attemptId, at: a.startedAt, type: "start", start });
    events.push({ id: "complete", attemptId, at: a.endedAt, type: "complete" });
  }
  storage.setItem(RECORDS_KEY, JSON.stringify({ schema: 1, events }));
}
