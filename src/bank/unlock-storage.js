import { deriveUnlockState, mergeMaxOpenLevel } from "./unlock.js";
import { withBankLock } from "./write-lock.js";

export const UNLOCK_KEY = "sudoku-bank-unlock-v1";
/** @typedef {{schema: 1, playerId: string, maxOpenLevel: number}} UnlockSave */

/** Read only the bank high-water mark. A different player's value is unreadable.
 * @param {import('./types.js').Storage} storage
 * @param {string} playerId
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
    return { status: "ok", state };
  } catch (error) {
    return { status: "unreadable", detail: error instanceof Error ? error.message : "Read failed" };
  }
}

/** Explicit opt-in write; retry this call after a failure. Each call reads under
 * the recorder's lock, so stale attempts can never lower the persisted level.
 * Snapshot caller input before waiting for another tab.
 * @param {import('./types.js').Storage} storage
 * @param {import('./types.js').Attempt[]} attempts
 * @param {{playerId: string, locks: Pick<LockManager, 'request'> | null, policy?: import('./unlock.js').UnlockPolicy}} options
 * @returns {Promise<{ok: true, state: UnlockSave}|{ok: false, code: string, detail?: string}>} */
export async function persistUnlockState(storage, attempts, { playerId, locks, policy }) {
  try {
    if (typeof playerId !== "string" || !playerId || attempts.some((a) => a.playerId !== playerId))
      return { ok: false, code: "invalid_player" };
    const derived = deriveUnlockState(structuredClone(attempts), policy);
    return await withBankLock(locks, () => {
      const current = readUnlockState(storage, playerId);
      if (current.status === "unreadable")
        return { ok: false, code: "unreadable_storage", detail: current.detail };
      const maxOpenLevel = mergeMaxOpenLevel(
        current.state?.maxOpenLevel ?? derived.maxOpenLevel,
        derived.maxOpenLevel
      );
      /** @type {UnlockSave} */
      const state = { ...current.state, schema: 1, playerId, maxOpenLevel };
      if (current.state?.maxOpenLevel === maxOpenLevel) return { ok: true, state };
      const text = JSON.stringify(state);
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
