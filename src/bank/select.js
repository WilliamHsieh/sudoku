import { catalogIndex } from "./indexes.js";
import { deriveAbility } from "./ability.js";
import { levelBand } from "./grade.js";
import { CALIBRATION as C, RULE_VERSION } from "./calibration.js";
import { freezeSnapshot, requireVerifiedCatalog } from "./catalog.js";
import { canonical, seedHash } from "./random.js";

/** @type {WeakMap<ReturnType<typeof catalogIndex>, Map<import('./types.js').Level, readonly import('./types.js').Puzzle[]>>} */
const levelOrders = new WeakMap();

/** Fixed shuffled order shared by all players. Cache alongside the immutable catalog index.
 * @param {import('./types.js').Catalog} catalog
 * @param {import('./types.js').Level} level */
export function fixedLevelOrder(catalog, level) {
  requireVerifiedCatalog(catalog);
  levelBand(level);
  const index = catalogIndex(catalog);
  let orders = levelOrders.get(index);
  if (!orders) {
    orders = new Map();
    levelOrders.set(index, orders);
  }
  let order = orders.get(level);
  if (!order) {
    order = Object.freeze(
      index
        .byLevel(level)
        .map((puzzle) => ({
          puzzle,
          hash: seedHash(`${catalog.catalogVersion}:${level}:${puzzle.id}`),
        }))
        .sort(
          (a, b) =>
            a.hash - b.hash || (a.puzzle.id < b.puzzle.id ? -1 : a.puzzle.id > b.puzzle.id ? 1 : 0)
        )
        .map(({ puzzle }) => puzzle)
    );
    orders.set(level, order);
  }
  return order;
}

/** @typedef {import('./types.js').Recommendation & ({status: 'selected', puzzle: import('./types.js').Puzzle}|{status: 'exhausted_in_range'|'level_locked', fallbackPuzzle?: import('./types.js').Puzzle})} Selection */
/** Pure selection over an immutable catalog opened for this launch. Recent recommendations
 * are ordered oldest to newest and scoped to this player by the persistence caller.
 * Exhaustion proposes a replay; it never starts one without an explicit caller action.
 * @param {{catalog: import('./types.js').Catalog, records?: import('./types.js').Attempt[], playerId: string,
 * coldStart?: import('./types.js').ColdStart, mode: import('./types.js').Mode,
 * level?: import('./types.js').Level, maxOpenLevel?: import('./types.js').Level, seed: string|number,
 * recentRecommendations?: import('./types.js').Recommendation[]}} input
 * @returns {Selection} */
export function selectPuzzle({
  catalog,
  records = [],
  playerId,
  coldStart,
  mode,
  level,
  maxOpenLevel,
  seed,
  recentRecommendations = [],
}) {
  requireVerifiedCatalog(catalog);
  if (
    !["easy", "medium", "hard", "manual", "sequential"].includes(mode) ||
    !(typeof seed === "string" || (typeof seed === "number" && Number.isFinite(seed)))
  )
    throw new Error("Invalid selection mode or seed");
  const fixedLevel = mode === "manual" || mode === "sequential";
  if (fixedLevel && level === undefined)
    throw new Error(
      mode === "manual"
        ? "Manual selection requires a level"
        : "Sequential selection requires a level"
    );
  const openBand = maxOpenLevel === undefined ? undefined : levelBand(maxOpenLevel);
  const locked = fixedLevel && maxOpenLevel !== undefined && level > maxOpenLevel;
  let ability = deriveAbility({ catalog, records, playerId, coldStart });
  /** @type {import('./types.js').ColdStart} */
  let effectiveColdStart = coldStart ?? { kind: "level", level: 1 };
  // Provisional alone means no promotion yet, not necessarily no evidence.
  // Keep ability derivation and explicit caller anchors unchanged once evidence exists.
  if (!fixedLevel && coldStart === undefined && ability.evidenceCount === 0) {
    effectiveColdStart = { kind: "level", level: C.coldStartLevels[mode] };
    ability = deriveAbility({ catalog, records, playerId, coldStart: effectiveColdStart });
  }
  const originalBand = fixedLevel ? levelBand(level) : ability.bands[mode];
  const band = { ...originalBand, max: Math.min(originalBand.max, openBand?.max ?? Infinity) };
  const index = catalogIndex(catalog);
  const neighborhoods = new Map(ability.neighborhoods.map((n) => [n.ratingTenths, n]));
  const history = records.filter((a) => a.playerId === playerId);
  const recent = recentRecommendations.slice(-C.recentRecommendationLimit);
  const recentIds = new Set(recent.map((r) => r.puzzleId));
  const played = new Set();
  const active = new Set();
  for (const attempt of history) {
    if (!attempt.puzzle) continue;
    played.add(attempt.puzzle.digits);
    if (attempt.outcome === "in_progress" || attempt.outcome === "paused")
      active.add(attempt.puzzle.digits);
  }
  const candidates = fixedLevel
    ? mode === "manual"
      ? fixedLevelOrder(catalog, level)
      : index.byLevel(level)
    : index.ratings
        .filter((rating) => rating <= band.max)
        .flatMap((rating) => index.byRating(rating));
  const available = candidates.filter(
    (p) =>
      (mode === "manual" || !recentIds.has(p.id)) &&
      !active.has(p.digits) &&
      (maxOpenLevel === undefined || p.level <= maxOpenLevel)
  );
  const pool = available.filter((p) => p.ratingTenths >= band.min && p.ratingTenths <= band.max);
  const ratings = [...new Set(pool.map((p) => p.ratingTenths))].sort((a, b) => a - b);
  const codes = [
    fixedLevel
      ? mode === "sequential"
        ? "sequential_level"
        : "manual_level"
      : ability.provisional
        ? "provisional_anchor"
        : "personalized_range",
    "present_ratings_only",
    "rating_gap_stay_in_range",
    mode === "sequential"
      ? "rating_then_catalog_id"
      : mode === "manual"
        ? "fixed_level_order"
        : "rating_bucket_then_puzzle",
  ];
  if (mode === "easy" && ability.easyCaution) codes.push("easy_failure_caution");
  let detail = `Allowed rating tenths ${band.min}..${band.max}; available ratings: ${ratings.join(", ") || "none"}. Gaps use present buckets within the allowed range.`;
  const historyText = canonical({
    records: [...history].sort((a, b) => a.attemptId.localeCompare(b.attemptId)),
    recentRecommendations: recent,
  });
  /** @type {import('./types.js').Recommendation} */
  const snapshot = {
    mode,
    candidateRange: { min: band.min, max: Number.isFinite(band.max) ? band.max : null },
    selectedRatingBucket: null,
    puzzleId: null,
    reason: { codes, detail },
    fallbackUsed: false,
    ruleVersion: RULE_VERSION,
    historySnapshotVersion: `history-v1-${seedHash(historyText)}-${seedHash(`history:${historyText}`)}`,
    catalogVersion: catalog.catalogVersion,
    seed,
    context: {
      coldStart: effectiveColdStart,
      ...(mode === "manual" ? { manualLevel: level } : {}),
      ...(mode === "sequential" ? { sequentialLevel: level } : {}),
      ...(maxOpenLevel === undefined ? {} : { maxOpenLevel }),
      recentPuzzleIds: recent.map((r) => r.puzzleId),
    },
  };
  if (locked)
    return freezeSnapshot({
      ...snapshot,
      status: "level_locked",
      reason: {
        codes: [...codes, "level_locked"],
        detail: `Level ${level} is above max open level ${maxOpenLevel}.`,
      },
    });
  /** Lexicographic priorities: later priorities cannot cancel earlier ones.
   * @param {number} rating */
  const priority = (rating) => {
    const evidence = neighborhoods.get(rating);
    if (mode === "easy") return evidence?.classification === "familiar" ? 0 : 1;
    if (mode === "medium")
      return evidence?.classification === "solvable_effortful"
        ? 0
        : evidence?.independentComplete
          ? 1
          : 2;
    if (mode === "hard") return evidence?.classification === "unstable" ? 0 : 1;
    return 0;
  };
  /** Pick a bucket before a board, so bucket population never affects difficulty.
   * @param {import('./types.js').Puzzle[]} candidates */
  const sample = (candidates) => {
    // Fixed-level candidates retain their manual hash or sequential rating order.
    if (fixedLevel) return candidates[0];
    let buckets = [...new Set(candidates.map((p) => p.ratingTenths))].sort((a, b) => a - b);
    const best = Math.min(...buckets.map(priority));
    const preferred = buckets.filter((r) => priority(r) === best);
    // Nearby exploration is allowed only inside the previously determined Hard range.
    const explore =
      mode === "hard" &&
      best === 0 &&
      seedHash(`${seed}:explore`) / 2 ** 32 < C.hardExplorationShare;
    buckets = explore
      ? buckets.filter((r) => priority(r) !== best && !neighborhoods.get(r)?.firstValidAttemptCount)
      : preferred;
    if (!buckets.length) buckets = preferred;
    if (mode === "easy") buckets = buckets.slice(0, C.conservativeBucketCount);
    if (mode === "medium") buckets = buckets.slice(-C.conservativeBucketCount);
    // A recent failure is a secondary Easy priority, after familiarity.
    if (mode === "easy") {
      const unstuck = buckets.filter((r) => !neighborhoods.get(r)?.explicitFail);
      if (unstuck.length) buckets = unstuck;
    }
    const lastRating = recent.at(-1)?.selectedRatingBucket;
    const diverse = buckets.filter((r) => r !== lastRating);
    if (diverse.length) buckets = diverse;
    const rating = buckets[seedHash(`${seed}:rating`) % buckets.length];
    const boards = candidates
      .filter((p) => p.ratingTenths === rating)
      .sort((a, b) => a.id.localeCompare(b.id));
    return boards[seedHash(`${seed}:puzzle`) % boards.length];
  };
  let unseen = pool.filter((p) => !played.has(p.digits));
  if (!unseen.length && !fixedLevel && !(openBand && openBand.max < originalBand.min)) {
    // Equal range was tried above. A conservative fallback may only go downward.
    unseen = available.filter(
      (p) => p.ratingTenths < band.min && p.ratingTenths <= band.max && !played.has(p.digits)
    );
    if (unseen.length) {
      snapshot.fallbackUsed = true;
      codes.push("conservative_unseen_range");
      detail += " The original range has no unseen puzzle; a lower range is used.";
      snapshot.candidateRange = {
        min: Math.min(...unseen.map((p) => p.ratingTenths)),
        max: Math.max(...unseen.map((p) => p.ratingTenths)),
      };
    }
  }
  if (unseen.length) {
    const puzzle = structuredClone(sample(unseen));
    const neighborhood = neighborhoods.get(puzzle.ratingTenths);
    codes.push(`evidence_${neighborhood?.classification ?? "insufficient_evidence"}`);
    if (mode === "easy") codes.push("conservative_side");
    if (mode === "medium") codes.push("comfortable_upper_edge");
    if (mode === "hard")
      codes.push(neighborhood?.classification === "unstable" ? "known_frontier" : "nearby_range");
    detail += ` Selected bucket ${puzzle.ratingTenths}; evidence ${neighborhood?.classification ?? "insufficient_evidence"}.`;
    return freezeSnapshot({
      ...snapshot,
      status: "selected",
      puzzle,
      puzzleId: puzzle.id,
      selectedRatingBucket: puzzle.ratingTenths,
      reason: { codes: [...codes, "unseen_in_range"], detail },
    });
  }
  const fallbackPuzzle = pool.length ? structuredClone(sample(pool)) : undefined;
  return freezeSnapshot({
    ...snapshot,
    status: "exhausted_in_range",
    fallbackUsed: true,
    puzzleId: fallbackPuzzle?.id ?? null,
    selectedRatingBucket: fallbackPuzzle?.ratingTenths ?? null,
    ...(fallbackPuzzle ? { fallbackPuzzle } : {}),
    reason: {
      codes: [
        ...codes,
        fallbackPuzzle ? "propose_replay_in_range" : "manual_level_change_required",
      ],
      detail: `${detail} No unseen puzzle in the suitable or conservative range; an explicit replay or manual level change is needed.`,
    },
  });
}
