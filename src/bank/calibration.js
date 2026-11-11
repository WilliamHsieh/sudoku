// These are rules, not probability estimates.
export const CALIBRATION = Object.freeze({
  // Progressive unlock: signed off by William 2026-11-11.
  unlockInitialLevels: 3,
  unlockRequiredHintFreeSolves: 10,
  unlockMaxLevel: 8,
  // Other calibration values remain 待校準.
  promotionWindow: 5,
  independentRequired: 4,
  minimumSamples: 5,
  repeatedStruggle: 2,
  neighborhoodTenths: 3,
  stepsPerAdjustment: 1,
  maxPerLevel: 500,
  recentRecommendationLimit: 10,
  familiarityLightRequired: 4,
  hardExplorationShare: 0.2,
  conservativeBucketCount: 2,
  coldEasyBelow: 3,
  coldEasyAboveL1: 2,
  coldMediumAbove: 3,
  coldHardAbove: 6,
});
export const RULE_VERSION = "selection-v1";
export const NO_FEEDBACK_POLICY = "ignore";
