import { hintStateKey } from "./hint.js";

/** Reading position only; saved data never supplies an executable hint/proof.
 * @typedef {{version: 1, key: string, identity: string, stage: number}} HintProgress
 */

/** Ignore old, corrupt or stale reading positions without discarding the board.
 * @param {unknown} value
 * @param {import('../game/game.js').GameState} state
 * @returns {HintProgress | null}
 */
export function readHintProgress(value, state) {
  const saved = /** @type {Partial<HintProgress> | null} */ (value);
  if (
    !saved ||
    saved.version !== 1 ||
    state.notesMode === "manual" ||
    saved.key !== hintStateKey(state) ||
    typeof saved.identity !== "string" ||
    !saved.identity ||
    !Number.isInteger(saved.stage) ||
    saved.stage < 0 ||
    saved.stage > 2
  )
    return null;
  return { version: 1, key: saved.key, identity: saved.identity, stage: saved.stage };
}

/** Compare the complete provider result, including its explanation and effects.
 * A changed engine result starts at observation rather than a mismatched stage.
 * @param {import('./hint.js').Hint} hint
 */
export function hintIdentity(hint) {
  return JSON.stringify(hint);
}
