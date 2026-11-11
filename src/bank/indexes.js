import { requireVerifiedCatalog } from "./catalog.js";

/** @type {WeakMap<import('./types.js').Catalog, ReturnType<typeof buildCatalogIndex>>} */
const cached = new WeakMap();

/** Read-only lookup facade; maps stay private and buckets cannot be mutated.
 * @param {import('./types.js').Catalog} catalog */
export function buildCatalogIndex(catalog) {
  /** @type {Map<string, import('./types.js').Puzzle>} */
  const ids = new Map();
  /** @type {Map<string, import('./types.js').Puzzle>} */
  const digits = new Map();
  /** @type {Map<number, import('./types.js').Puzzle[]>} */
  const levels = new Map();
  /** @type {Map<number, import('./types.js').Puzzle[]>} */
  const buckets = new Map();
  for (const p of catalog.puzzles) {
    ids.set(p.id, p);
    // Preserve Array.find semantics for callers of deriveAbility with raw catalogs.
    if (!digits.has(p.digits)) digits.set(p.digits, p);
    if (!levels.has(p.level)) levels.set(p.level, []);
    if (!buckets.has(p.ratingTenths)) buckets.set(p.ratingTenths, []);
    levels.get(p.level).push(p);
    buckets.get(p.ratingTenths).push(p);
  }
  const compare = (a, b) => a.ratingTenths - b.ratingTenths || a.id.localeCompare(b.id);
  for (const group of [levels, buckets])
    for (const bucket of group.values()) Object.freeze(bucket.sort(compare));
  const empty = Object.freeze([]);
  const ratings = Object.freeze([...buckets.keys()].sort((a, b) => a - b));
  return Object.freeze({
    ratings,
    byId: (/** @type {string} */ id) => ids.get(id),
    byDigits: (/** @type {string} */ board) => digits.get(board),
    byLevel: (/** @type {number} */ level) => levels.get(level) ?? empty,
    byRating: (/** @type {number} */ rating) => buckets.get(rating) ?? empty,
    hasRating: (/** @type {number} */ rating) => buckets.has(rating),
  });
}

/** Only verified immutable snapshots can be cached safely. Mutable ability inputs
 * retain their existing behavior and receive a fresh index on each call.
 * @param {import('./types.js').Catalog} catalog */
export function catalogIndex(catalog) {
  try {
    requireVerifiedCatalog(catalog);
  } catch {
    return buildCatalogIndex(catalog);
  }
  let index = cached.get(catalog);
  if (!index) {
    index = buildCatalogIndex(catalog);
    cached.set(catalog, index);
  }
  return index;
}
