import { freezeSnapshot } from "./catalog.js";
import { projectRecords } from "./records.js";

/** Build a private attempt snapshot. The caller supplies identities and source;
 * selection never starts an attempt by itself.
 * @param {import('./select.js').Selection} selection
 * @param {{attemptId: string, playerId: string, source: import('./types.js').Source}} context
 * @returns {import('./types.js').BankGameMeta}
 */
export function buildBankGameMeta(selection, context) {
  if (selection.status !== "selected") throw new Error("A selected puzzle is required");
  const { puzzle, ...recommendation } = selection;
  const meta = structuredClone({
    ...context,
    puzzleId: puzzle.id,
    level: puzzle.level,
    puzzle,
    mode: recommendation.mode,
    catalogVersion: recommendation.catalogVersion,
    ruleVersion: recommendation.ruleVersion,
    reason: recommendation.reason,
    recommendation,
    replay: false,
    settings: { candidateMode: "auto" },
  });
  validateBankGameMeta(meta);
  return freezeSnapshot(meta);
}

/** @param {import('./types.js').BankGameMeta} meta */
export function validateBankGameMeta(meta) {
  if (
    !meta ||
    meta.puzzleId !== meta.puzzle?.id ||
    meta.level !== meta.puzzle?.level ||
    !meta.recommendation
  )
    throw new Error("Invalid bank game meta");
  projectRecords({
    schema: 1,
    events: [{ id: "validate", attemptId: meta.attemptId, at: 1, type: "start", start: meta }],
  });
}
