import { ADVANCED_PATTERN_TECHNIQUES, detectAdvancedPattern } from "./engine-advanced-patterns.js";
import { CHAIN_TECHNIQUES, detectAdvancedChain } from "./engine-advanced-chains.js";
import { ALS_TECHNIQUES, detectALS } from "./engine-als.js";

export const ADVANCED_TECHNIQUES = Object.freeze([
  "rectangle-elimination",
  "x-cycles",
  "xy-chain",
  "3d-medusa",
  "wxyz-wing",
  "aligned-pair-exclusion",
  "grouped-x-cycles",
  "aic",
  "als-xz",
  "als-xy-wing",
  "death-blossom",
  "sue-de-coq",
]);

/** @param {number[]} values @param {number[]} masks @param {string} techniqueId
 * @param {number[]} [effectMasks] @returns {import('./proof-verifier.js').Step|null} */
export function detectAdvanced(values, masks, techniqueId, effectMasks = masks) {
  if (ADVANCED_PATTERN_TECHNIQUES.includes(techniqueId))
    return detectAdvancedPattern(values, masks, techniqueId, effectMasks);
  if (CHAIN_TECHNIQUES.includes(techniqueId))
    return detectAdvancedChain(values, masks, techniqueId, effectMasks);
  if (ALS_TECHNIQUES.includes(techniqueId))
    return detectALS(values, masks, techniqueId, effectMasks);
  throw new Error(`Unknown advanced technique: ${techniqueId}`);
}
