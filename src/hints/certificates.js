// Runtime receipts cannot be forged by serialized snapshots or demo providers.
const receipts = new WeakMap();
/** @param {import('./hint.js').Hint} hint @param {string} key */
export function registerVerifiedHint(hint, key) {
  /** @param {unknown} value */
  const freeze = (value) => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  };
  freeze(hint);
  receipts.set(hint, key);
}
/** @param {import('./hint.js').Hint} hint @param {string} key */
export function isVerifiedHint(hint, key) {
  return receipts.get(hint) === key;
}
