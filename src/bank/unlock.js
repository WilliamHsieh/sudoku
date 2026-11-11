import { firstAttempts } from "./ability.js";
import { CALIBRATION as C } from "./calibration.js";
import { levelBand } from "./grade.js";

/** @typedef {{unlockInitialLevels?: number, unlockRequiredHintFreeSolves?: number, unlockMaxLevel?: number}} UnlockPolicy */
/** Derive one player's unlock evidence from projected bank records only.
 * This function never reads storage or imports legacy saves; everyone starts at
 * the signed-off initial levels without credit for legacy play.
 * Callers must scope attempts to one player.
 * First attempts reserve a board even when unfinished or unsuccessful. Unknown hint
 * counts fail closed; derive them from the event log before using older snapshots.
 * @param {import('./types.js').Attempt[]} attempts
 * @param {UnlockPolicy} [policy] */
export function deriveUnlockState(attempts, policy = {}) {
  const initial = policy.unlockInitialLevels ?? C.unlockInitialLevels;
  const required = policy.unlockRequiredHintFreeSolves ?? C.unlockRequiredHintFreeSolves;
  const maximum = policy.unlockMaxLevel ?? C.unlockMaxLevel;
  levelBand(/** @type {import('./types.js').Level} */ (initial));
  levelBand(/** @type {import('./types.js').Level} */ (maximum));
  if (maximum < initial || !Number.isSafeInteger(required) || required <= 0)
    throw new Error("Invalid unlock policy");
  const players = new Set(attempts.map((a) => a.playerId));
  if (players.size > 1) throw new Error("Unlock attempts must belong to one player");
  /** @type {Record<number, {independentSolves: number, hintFreeSolves: number, required: number}>} */
  const perLevel = {};
  for (let level = 1; level <= maximum; level++)
    perLevel[level] = { independentSolves: 0, hintFreeSolves: 0, required };
  for (const attempt of firstAttempts(attempts, attempts[0]?.playerId)) {
    const counts = perLevel[attempt.puzzle.level];
    if (!counts || attempt.outcome !== "independent_complete" || attempt.answerRevealed) continue;
    counts.independentSolves++;
    if (attempt.hintCount === 0 && !attempt.hintUsed) counts.hintFreeSolves++;
  }
  let maxOpenLevel = initial;
  // Each frontier needs its own evidence; lower-level wins cannot skip a level.
  while (maxOpenLevel < maximum && perLevel[maxOpenLevel].hintFreeSolves >= required)
    maxOpenLevel++;
  return { maxOpenLevel, perLevel };
}

/** Callers persist this high-water mark; this module never writes storage.
 * @param {number} previous @param {number} derived */
export function mergeMaxOpenLevel(previous, derived) {
  levelBand(/** @type {import('./types.js').Level} */ (previous));
  levelBand(/** @type {import('./types.js').Level} */ (derived));
  return Math.max(previous, derived);
}
