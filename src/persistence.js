// Keep failed writes in memory. Gameplay must remain usable when storage is full.
/** @type {Map<string, string>} */
const pending = new Map();

/** @param {Storage} storage @param {string} key @param {string} value */
export function writeVerified(storage, key, value) {
  try {
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

/** @param {string} key @param {string} value */
export function saveLocal(key, value) {
  pending.set(key, value);
  try {
    if (!writeVerified(localStorage, key, value)) return false;
    pending.delete(key);
    return true;
  } catch {
    return false;
  }
}

export function flushLocal() {
  for (const [key, value] of pending) saveLocal(key, value);
  return pending.size === 0;
}
