export const BANK_LOCK = "sudoku-bank-writes-v1";
// Shared with the recorder: without Web Locks this protects one document only.
let fallback = Promise.resolve();

/** Serialize bank writes without accessing storage or a browser global.
 * @template T
 * @param {Pick<LockManager, 'request'> | null} locks
 * @param {() => T | Promise<T>} work
 * @returns {Promise<T>} */
export async function withBankLock(locks, work) {
  if (locks) return locks.request(BANK_LOCK, work);
  const next = fallback.then(work);
  fallback = next.then(
    () => {},
    () => {}
  );
  return next;
}
