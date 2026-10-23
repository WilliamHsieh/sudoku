// Keep failed writes in memory. Gameplay must remain usable when storage is full.
/** @type {Map<string, string>} */
const pending = new Map();
// Values this document read or successfully wrote, not values from storage events.
// A changed baseline must never be accepted just to make a stale write pass.
/** @type {Map<string, string | null | undefined>} */
const observed = new Map();

/** Read before initializing an in-memory store. @param {string} key */
export function readLocal(key) {
  const first = !observed.has(key);
  // An unreadable initial value is unknown, not permission to replace it later.
  if (first) observed.set(key, undefined);
  const value = localStorage.getItem(key);
  if (first) observed.set(key, value);
  return value;
}

/** Check all shared stores before any flush, including delayed game mutations. */
export function localUnchanged() {
  try {
    return [...observed].every(([key, value]) => localStorage.getItem(key) === value);
  } catch {
    return false;
  }
}

/** Carry the original document's storage baseline across update navigation. */
export function localBaseline() {
  return Object.fromEntries(observed);
}

/** @param {unknown} baseline */
export function restoreLocalBaseline(baseline) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) return false;
  const keys = [...observed.keys()];
  if (
    Object.keys(baseline).length !== keys.length ||
    keys.some(
      (key) => !(key in baseline) || (baseline[key] !== null && typeof baseline[key] !== "string")
    )
  )
    return false;
  // Restore even a conflicting baseline: the board stays recoverable in memory,
  // but subsequent saves cannot overwrite changes made during navigation.
  for (const key of keys) observed.set(key, baseline[key]);
  return true;
}

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
    if (!observed.has(key)) readLocal(key);
    // Also guard ordinary gameplay, completion/clear pairs, and pending retries.
    // Conflicts keep the local edit in memory and leave the other tab's disk data intact.
    if (!localUnchanged()) return false;
    if (!writeVerified(localStorage, key, value)) return false;
    observed.set(key, value);
    pending.delete(key);
    return true;
  } catch {
    return false;
  }
}

export function flushLocal() {
  if (!localUnchanged()) return false;
  for (const [key, value] of pending) saveLocal(key, value);
  return pending.size === 0;
}
