import { RECORDS_KEY } from "./records.js";
/** Store synthetic completed attempts as their authoritative schema-1 event log.
 * The event log remains available even when an unlock checkpoint write fails.
 * @param {import('./types.js').Storage} storage @param {import('./types.js').Attempt[]} attempts */
export function storeCompletedAttempts(storage, attempts) {
  if (attempts.some((a) => a.outcome !== "independent_complete" || a.hintCount !== 0))
    throw Error("Completed fixture required");
  storeAttempts(storage, attempts);
}

/** Store synthetic attempts, including exclusions, as schema-1 events.
 * @param {import('./types.js').Storage} storage @param {import('./types.js').Attempt[]} attempts */
export function storeAttempts(storage, attempts) {
  /** @type {import('./types.js').PlayEvent[]} */
  const events = [];
  for (const a of attempts) {
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
    for (let i = 0; i < a.hintCount; i++)
      events.push({ id: `hint-${i}`, attemptId, at: a.startedAt, type: "hint" });
    if (a.answerRevealed)
      events.push({ id: "reveal", attemptId, at: a.endedAt ?? a.updatedAt, type: "reveal" });
    else if (a.outcome === "independent_complete" || a.outcome === "hinted_complete")
      events.push({ id: "complete", attemptId, at: a.endedAt, type: "complete" });
    else if (a.outcome === "paused")
      events.push({ id: "pause", attemptId, at: a.updatedAt, type: "pause" });
    else if (a.outcome === "gave_up")
      events.push({ id: "give_up", attemptId, at: a.endedAt, type: "give_up" });
  }
  storage.setItem(RECORDS_KEY, JSON.stringify({ schema: 1, events }));
}
