import { CALIBRATION as C } from "./calibration.js";
import { levelBand } from "./grade.js";
import { validatePuzzle, validateSource } from "./catalog.js";
import { catalogIndex } from "./indexes.js";
import { isTerminal } from "./records.js";

/** Pure, injectable cold-start setting. The caller owns persistence and any experience labels.
 * @param {import('./types.js').ColdStart} input @returns {import('./types.js').ColdStart} */
export function setColdStart(input) {
  if (!input || !["level", "experience"].includes(input.kind))
    throw new Error("Invalid cold start");
  levelBand(input.kind === "level" ? input.level : input.mapsToLevel);
  return structuredClone(input);
}
/** @param {import('./types.js').ColdStart} coldStart */
function provisional(coldStart) {
  const level = coldStart.kind === "level" ? coldStart.level : coldStart.mapsToLevel;
  const anchor = levelBand(level);
  const medium = { min: anchor.min, max: Math.min(anchor.max, anchor.min + C.coldMediumAbove) };
  return {
    easy: {
      min: Math.max(10, anchor.min - C.coldEasyBelow),
      max: level === 1 ? anchor.min + C.coldEasyAboveL1 : anchor.min,
    },
    medium,
    hard: { min: medium.max, max: Math.min(anchor.max, anchor.min + C.coldHardAbove) },
  };
}
/** Attempt IDs and board identity both guard against replay evidence, including
 * caller-supplied histories. Unrated legacy/custom objects are not evidence.
 * @param {import('./types.js').Attempt[]} records @param {string} playerId */
export function firstAttempts(records, playerId) {
  const ids = new Set();
  const boards = new Set();
  return records
    .filter((a) => a.playerId === playerId && !a.replay)
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt || a.attemptId.localeCompare(b.attemptId))
    .filter((a) => {
      if (
        !a.puzzle ||
        !Number.isSafeInteger(a.puzzle.ratingTenths) ||
        !a.catalogVersion ||
        !a.source ||
        ids.has(a.attemptId)
      )
        return false;
      try {
        validatePuzzle(a.puzzle);
        validateSource(a.source);
      } catch {
        return false;
      }
      ids.add(a.attemptId);
      const seen = boards.has(a.puzzle.id) || boards.has(a.puzzle.digits);
      boards.add(a.puzzle.id);
      boards.add(a.puzzle.digits);
      return !seen;
    })
    .sort((a, b) => a.startedAt - b.startedAt || a.attemptId.localeCompare(b.attemptId));
}
/** @param {import('./types.js').Attempt} attempt */
function independent(attempt) {
  return attempt.outcome === "independent_complete" && !attempt.hintUsed && !attempt.answerRevealed;
}
/** Conservative sequential rules, using only present ratings for every expansion.
 * Time is intentionally unused, so speeds under different assistance are never compared.
 * @param {{catalog: import('./types.js').Catalog, records?: import('./types.js').Attempt[], playerId: string, coldStart?: import('./types.js').ColdStart}} input */
export function deriveAbility({
  catalog,
  records = [],
  playerId,
  coldStart = { kind: "level", level: 1 },
}) {
  const bands = provisional(setColdStart(coldStart));
  const index = catalogIndex(catalog);
  const ratings = index.ratings;
  const history = firstAttempts(records, playerId).filter((a) => {
    const current = index.byDigits(a.puzzle.digits);
    return (
      index.hasRating(a.puzzle.ratingTenths) &&
      (!current || current.ratingTenths === a.puzzle.ratingTenths)
    );
  });
  const eligibleEasy = new Set();
  const eligibleMedium = new Set();
  /** @type {Map<number, import('./types.js').Attempt[]>} */
  const mediumWindow = new Map();
  /** @type {Map<number, import('./types.js').Attempt[]>} */
  const easyWindow = new Map();
  /** @type {{code: string, ratingTenths: number, attemptIds: string[]}[]} */
  const promotions = [];
  /** Use bounded offsets rather than incrementing rating values: valid L8 ratings
   * can reach Number.MAX_SAFE_INTEGER, where adding one can stop making progress.
   * @param {number} center */
  const nearbyRatings = (center) => {
    const present = new Set();
    for (let offset = -C.neighborhoodTenths; offset <= C.neighborhoodTenths; offset++) {
      const rating = Math.ceil(center) + offset;
      if (index.hasRating(rating) && Math.abs(rating - center) <= C.neighborhoodTenths)
        present.add(rating);
    }
    return [...present];
  };
  /** @param {number} ceiling */
  const nextRating = (ceiling) =>
    nearbyRatings(ceiling).filter((r) => r > ceiling)[C.stepsPerAdjustment - 1];
  /** @param {Map<number, import('./types.js').Attempt[]>} window @param {number} target @param {'easy'|'medium'|'medium_explore'} destination */
  const stable = (window, target, destination) => {
    const recent = window.get(target) ?? [];
    const wins = recent.filter(
      (a) =>
        independent(a) &&
        (destination === "medium"
          ? eligibleMedium.has(a.attemptId)
          : eligibleEasy.has(a.attemptId) && a.feedback === "light") &&
        // Medium may explore one nearby step from light evidence in its current band.
        // Promotion from Hard or into Easy still needs evidence at/above the target.
        (destination === "medium_explore"
          ? a.puzzle.ratingTenths >= bands.medium.min && a.puzzle.ratingTenths <= bands.medium.max
          : a.puzzle.ratingTenths >= target)
    );
    return recent.length >= C.minimumSamples &&
      wins.length >=
        (destination === "easy"
          ? Math.max(C.independentRequired, C.familiarityLightRequired)
          : C.independentRequired) &&
      recent.filter((a) => a.feedback === "struggle").length < C.repeatedStruggle
      ? recent
      : null;
  };
  for (const attempt of history) {
    const rating = attempt.puzzle.ratingTenths;
    if (attempt.mode === "medium" && rating >= bands.medium.min && rating <= bands.medium.max)
      eligibleEasy.add(attempt.attemptId);
    if (attempt.mode === "hard" && rating >= bands.hard.min && rating <= bands.hard.max)
      eligibleMedium.add(attempt.attemptId);
    for (const window of [mediumWindow, easyWindow]) {
      for (const target of nearbyRatings(rating)) {
        const recent = window.get(target) ?? [];
        recent.push(attempt);
        if (recent.length > C.promotionWindow) recent.shift();
        window.set(target, recent);
      }
    }
    const mediumTarget = nextRating(bands.medium.max);
    const hardProof =
      mediumTarget !== undefined && mediumTarget <= bands.hard.max
        ? stable(mediumWindow, mediumTarget, "medium")
        : null;
    const mediumLightProof =
      mediumTarget !== undefined && !hardProof
        ? stable(mediumWindow, mediumTarget, "medium_explore")
        : null;
    const mediumProof = hardProof || mediumLightProof;
    if (mediumProof) {
      bands.medium.max = mediumTarget;
      bands.hard = { min: mediumTarget, max: mediumTarget + C.neighborhoodTenths };
      promotions.push({
        code: hardProof ? "hard_entered_medium" : "light_medium_explored",
        ratingTenths: mediumTarget,
        attemptIds: mediumProof.map((a) => a.attemptId),
      });
      mediumWindow.clear(); // A consumed window cannot drive multiple steps.
    }
    const easyTarget = nextRating(bands.easy.max);
    const easyProof =
      easyTarget !== undefined && easyTarget <= bands.medium.max
        ? stable(easyWindow, easyTarget, "easy")
        : null;
    if (easyProof) {
      bands.easy.max = easyTarget;
      promotions.push({
        code: "light_medium_entered_easy",
        ratingTenths: easyTarget,
        attemptIds: easyProof.map((a) => a.attemptId),
      });
      easyWindow.clear();
    }
  }
  const stableEasy = { ...bands.easy };
  // Include replay failures for next-pick caution; they never raise ability.
  const latestEasy = records
    .filter((a) => a.playerId === playerId && a.puzzle && a.mode === "easy" && isTerminal(a))
    .sort(
      (a, b) =>
        (b.endedAt ?? b.updatedAt) - (a.endedAt ?? a.updatedAt) ||
        b.attemptId.localeCompare(a.attemptId)
    )[0];
  const easyCaution = latestEasy?.outcome === "gave_up";
  if (easyCaution) {
    const below = ratings.filter(
      (r) => r >= bands.easy.min && r < Math.min(bands.easy.max, latestEasy.puzzle.ratingTenths)
    );
    bands.easy.max = below.at(-C.stepsPerAdjustment) ?? bands.easy.min - 1;
  }
  // Index evidence by each present neighboring rating once, preserving history order.
  /** @type {Map<number, import('./types.js').Attempt[]>} */
  const localEvidence = new Map();
  const replayCounts = new Map();
  for (const attempt of history) {
    for (const rating of nearbyRatings(attempt.puzzle.ratingTenths)) {
      if (!localEvidence.has(rating)) localEvidence.set(rating, []);
      localEvidence.get(rating).push(attempt);
    }
  }
  for (const attempt of records) {
    if (
      attempt.playerId !== playerId ||
      !attempt.replay ||
      !attempt.puzzle ||
      !Number.isFinite(attempt.puzzle.ratingTenths)
    )
      continue;
    // Preserve support for caller-supplied fractional replay ratings.
    for (const rating of nearbyRatings(attempt.puzzle.ratingTenths))
      replayCounts.set(rating, (replayCounts.get(rating) ?? 0) + 1);
  }
  return {
    bands,
    stableEasy,
    easyCaution,
    promotions,
    provisional: promotions.length === 0,
    evidenceCount: history.length,
    neighborhoods: ratings.map((rating) =>
      summarizeNeighborhood(rating, localEvidence.get(rating) ?? [], replayCounts.get(rating) ?? 0)
    ),
  };
}

/** Outcomes and unresolved attempts stay separate; no prediction of future success.
 * Feedback is optional, and time is retained only with its assistive-settings history.
 * @param {number} rating @param {import('./types.js').Attempt[]} local
 * @param {number} replayCount */
function summarizeNeighborhood(rating, local, replayCount) {
  const recent = local.slice(-C.promotionWindow);
  const independentCount = recent.filter(independent).length;
  const feedback = { light: 0, some_effort: 0, struggle: 0, missing: 0 };
  for (const a of recent) feedback[a.feedback ?? "missing"]++;
  const count = (/** @type {import('./types.js').Outcome} */ outcome) =>
    recent.filter((a) => a.outcome === outcome).length;
  const candidateSignal =
    recent.length >= C.minimumSamples &&
    independentCount >= C.independentRequired &&
    feedback.struggle < C.repeatedStruggle;
  const familiar =
    candidateSignal &&
    recent.filter((a) => independent(a) && a.feedback === "light").length >=
      C.familiarityLightRequired;
  const effortful = recent.some(
    (a) => independent(a) && (a.feedback === "some_effort" || a.feedback === "struggle")
  );
  return {
    ratingTenths: rating,
    firstValidAttemptCount: local.length,
    recentAttemptIds: recent.map((a) => a.attemptId),
    independentComplete: independentCount,
    hintedComplete: count("hinted_complete"),
    viewedAnswer: count("viewed_answer"),
    explicitFail: count("gave_up"),
    unresolved: count("in_progress") + count("paused"),
    solvabilityDenominator: independentCount + count("gave_up"),
    resolvedCount: recent.filter(isTerminal).length,
    feedback,
    candidateSignal,
    classification: familiar
      ? "familiar"
      : count("gave_up") > 0 && !candidateSignal
        ? "unstable"
        : effortful
          ? "solvable_effortful"
          : "insufficient_evidence",
    samples: local.map((a) => ({
      attemptId: a.attemptId,
      updatedAt: a.updatedAt,
      outcome: a.outcome,
      settingsHistory: structuredClone(a.settingsHistory),
      effectiveMs: a.effectiveMs,
      replay: a.replay,
    })),
    replayCount,
  };
}
