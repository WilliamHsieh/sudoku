import { grade } from "./grade.js";
import { puzzleId, validateDigits } from "./parse.js";

export const CATALOG_SCHEMA = 1;
const verified = new WeakSet();
/** @param {unknown} catalog */
export function requireVerifiedCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || !verified.has(catalog))
    throw new Error("Open a verified catalog for this launch before selecting");
}
/** @template T @param {T} value @returns {T} */
export function freezeSnapshot(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
/** @param {import('./types.js').Puzzle[]} puzzles */
export function catalogIndexes(puzzles) {
  /** @type {Record<string, string[]>} */
  const ratingIndex = {};
  /** @type {Record<string, number[]>} */
  const levelIndex = {};
  for (let level = 1; level <= 8; level++) levelIndex[level] = [];
  for (const p of [...puzzles].sort(
    (a, b) => a.ratingTenths - b.ratingTenths || a.id.localeCompare(b.id)
  )) {
    (ratingIndex[p.ratingTenths] ??= []).push(p.id);
    if (!levelIndex[p.level].includes(p.ratingTenths)) levelIndex[p.level].push(p.ratingTenths);
  }
  return { ratingIndex, levelIndex };
}
/** @param {unknown} value @returns {asserts value is import('./types.js').Source} */
export function validateSource(value) {
  const source = /** @type {import('./types.js').Source} */ (value);
  if (
    !source ||
    typeof source.repo !== "string" ||
    !/^https:\/\//.test(source.repo) ||
    !Array.isArray(source.files) ||
    !source.files.every((f) => typeof f === "string" && f.length > 0) ||
    !/^[a-f0-9]{40}$/.test(source.gitSha) ||
    typeof source.license !== "string" ||
    !source.license ||
    !source.grader ||
    ![source.grader.name, source.grader.version, source.grader.settings].every(
      (v) => typeof v === "string" && v.length > 0
    ) ||
    !source.verification ||
    ![source.verification.method, source.verification.version, source.verification.url].every(
      (v) => typeof v === "string" && v.length > 0
    )
  )
    throw new Error("Invalid source");
}
/** Structural validation is synchronous for event logs; catalog publication also verifies hashes.
 * @param {unknown} value @returns {asserts value is import('./types.js').Puzzle} */
export function validatePuzzle(value) {
  const puzzle = /** @type {import('./types.js').Puzzle} */ (value);
  if (
    !puzzle ||
    typeof puzzle.id !== "string" ||
    !/^[a-f0-9]{40}$/.test(puzzle.id) ||
    (puzzle.sourceHash !== undefined && puzzle.sourceHash !== puzzle.id.slice(0, 12)) ||
    grade(puzzle.ratingTenths) !== puzzle.level ||
    (puzzle.sourceBucket !== undefined && typeof puzzle.sourceBucket !== "string")
  )
    throw new Error("Invalid puzzle");
  validateDigits(puzzle.digits);
}
/** Validate before publishing or exposing a downloaded bank. Unknown schemas fail closed.
 * @param {unknown} value @returns {Promise<import('./types.js').Catalog>} */
export async function validateCatalog(value) {
  const catalog = /** @type {import('./types.js').Catalog} */ (value);
  if (
    !catalog ||
    catalog.schema !== CATALOG_SCHEMA ||
    typeof catalog.catalogVersion !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(catalog.catalogVersion) ||
    !Array.isArray(catalog.puzzles)
  )
    throw new Error("Invalid catalog schema or version");
  validateSource(catalog.source);
  const ids = new Set();
  const boards = new Set();
  for (const puzzle of catalog.puzzles) {
    validatePuzzle(puzzle);
    if ((await puzzleId(puzzle.digits)) !== puzzle.id) throw new Error("Hash mismatch");
    if (ids.has(puzzle.id) || boards.has(puzzle.digits)) throw new Error("Duplicate puzzle");
    ids.add(puzzle.id);
    boards.add(puzzle.digits);
  }
  const indexes = catalogIndexes(catalog.puzzles);
  for (const key of /** @type {const} */ (["ratingIndex", "levelIndex"])) {
    if (catalog[key] !== undefined && JSON.stringify(catalog[key]) !== JSON.stringify(indexes[key]))
      throw new Error("Invalid catalog index");
  }
  return structuredClone({ ...catalog, ...indexes });
}
/** Snapshot and index a validated catalog; callers cannot mutate the index through lookup.
 * @param {unknown} value */
export async function openCatalog(value) {
  const catalog = freezeSnapshot(await validateCatalog(value));
  verified.add(catalog);
  const byId = new Map(catalog.puzzles.map((p) => [p.id, p]));
  const byDigits = new Map(catalog.puzzles.map((p) => [p.digits, p]));
  return {
    catalog,
    byId: (/** @type {string} */ id) => structuredClone(byId.get(id)),
    byDigits: (/** @type {string} */ digits) => structuredClone(byDigits.get(digits)),
  };
}
