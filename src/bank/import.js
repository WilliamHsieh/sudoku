import { CALIBRATION } from "./calibration.js";
import { parseLine } from "./parse.js";
import { validateCatalog } from "./catalog.js";

/** Counts represent actual ratings, never inferred empty buckets.
 * @param {import('./types.js').Puzzle[]} puzzles */
function counts(puzzles) {
  /** @type {Record<string, number>} */
  const perRating = {};
  /** @type {Record<string, number>} */
  const perLevel = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 0]));
  for (const p of puzzles) {
    perRating[p.ratingTenths] = (perRating[p.ratingTenths] ?? 0) + 1;
    perLevel[p.level]++;
  }
  return { perRating, perLevel };
}
/** Read all identities before sampling so late rating conflicts cannot survive publication.
 * Full SHA-1 order is a deterministic, content-based pseudo-random order within a bucket.
 * Balanced round-robin allocation gives scarce rating buckets their share before redistribution.
 * @param {AsyncIterable<{line: string, sourceBucket?: string}>|Iterable<{line: string, sourceBucket?: string}>} lines
 * @param {{catalogVersion: string, source: import('./types.js').Source, maxPerLevel?: number}} options */
export async function importCatalog(
  lines,
  { catalogVersion, source, maxPerLevel = CALIBRATION.maxPerLevel }
) {
  if (!Number.isSafeInteger(maxPerLevel) || maxPerLevel < 1)
    throw new Error("Invalid max-per-level");
  /** @type {Map<string, import('./types.js').Puzzle>} */
  const boards = new Map();
  const conflicts = new Set();
  const identities = new Map();
  /** @type {{line: number, code: string, detail: string}[]} */
  const errors = [];
  let count = 0;
  for await (const entry of lines) {
    count++;
    const result = await parseLine(entry.line, entry.sourceBucket);
    if (result.ok === false) {
      errors.push({ line: count, code: "invalid_line", detail: result.error });
      continue;
    }
    const p = result.puzzle;
    const prior = boards.get(p.digits);
    if (identities.has(p.id) && identities.get(p.id) !== p.digits)
      throw new Error("Full-board ID collision; publication aborted");
    identities.set(p.id, p.digits);
    if (prior) {
      const conflict = prior.ratingTenths !== p.ratingTenths;
      if (conflict) conflicts.add(p.digits);
      errors.push({
        line: count,
        code: conflict ? "rating_conflict" : "duplicate_board",
        detail: `${p.id}: ${prior.ratingTenths}, ${p.ratingTenths}`,
      });
      // Choose provenance deterministically when identical rows occur in different files.
      if (!conflict && (p.sourceBucket ?? "") < (prior.sourceBucket ?? "")) boards.set(p.digits, p);
    } else boards.set(p.digits, p);
  }
  const valid = [...boards.values()].filter((p) => !conflicts.has(p.digits));
  /** @type {import('./types.js').Puzzle[]} */
  const puzzles = [];
  for (let level = 1; level <= 8; level++) {
    const levelPuzzles = valid.filter((p) => p.level === level);
    const ratings = [...new Set(levelPuzzles.map((p) => p.ratingTenths))].sort((a, b) => a - b);
    const spread =
      ratings.length <= maxPerLevel
        ? ratings
        : maxPerLevel === 1
          ? [ratings[Math.floor(ratings.length / 2)]]
          : Array.from(
              { length: maxPerLevel },
              (_, i) =>
                ratings[Math.round((i * (ratings.length - 1)) / Math.max(1, maxPerLevel - 1))]
            );
    const buckets = spread.map((r) =>
      levelPuzzles.filter((p) => p.ratingTenths === r).sort((a, b) => a.id.localeCompare(b.id))
    );
    let taken = 0;
    for (let row = 0; taken < maxPerLevel; row++) {
      let added = false;
      for (const bucket of buckets) {
        if (taken === maxPerLevel) break;
        if (bucket[row]) {
          puzzles.push(bucket[row]);
          taken++;
          added = true;
        }
      }
      if (!added) break;
    }
  }
  const catalog = await validateCatalog({ schema: 1, catalogVersion, source, puzzles });
  return {
    catalog,
    report: {
      lines: count,
      validUnique: valid.length,
      selected: puzzles.length,
      input: counts(valid),
      published: counts(puzzles),
      conflictedBoards: conflicts.size,
      errors,
    },
  };
}
