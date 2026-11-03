import { detectPattern, PATTERN_TECHNIQUES } from "./engine-patterns.js";
import { detectChain } from "./engine-chains.js";
import {
  legalMasks,
  validateMasks,
  verifyStep,
  verifyLedger,
  hasCompletion,
} from "./proof-verifier.js";
import { maskDigits } from "../game/board.js";
/** Product order is explicit; detector implementation order/rating is not teaching order. */
export const TECHNIQUES = [
  "full-house",
  "naked-single",
  "hidden-single",
  "naked-pair",
  "hidden-pair",
  "pointing",
  "box-line",
  "naked-triple",
  "hidden-triple",
  "x-wing",
  "chute-remote-pair",
  "xy-wing",
  "w-wing",
  "simple-colouring",
  "naked-quad",
  "hidden-quad",
  "swordfish",
  "xyz-wing",
  "jellyfish",
  "finned-x-wing",
  "finned-swordfish",
];
/** @param {number[]} values @param {number[]} masks @param {string} [techniqueId] @returns {import('./proof-verifier.js').Step|null} */
export function findStep(values, masks, techniqueId) {
  validateMasks(values, masks);
  const ids = techniqueId ? [techniqueId] : TECHNIQUES;
  for (const id of ids) {
    if (!TECHNIQUES.includes(id)) throw new Error("Unsupported technique");
    const step = PATTERN_TECHNIQUES.includes(id)
      ? detectPattern(values, masks, id)
      : detectChain(values, masks, id);
    if (step) return step;
  }
  return null;
}
/** @param {import('../game/game.js').GameState} state */
export function engineCandidates(state) {
  const values = state.givens.map((v, i) => v || state.answers[i]);
  const ledger = state.trustedEliminations;
  const masks =
    ledger && ledger.valuesKey === values.join("")
      ? verifyLedger(values, ledger.removed)
      : legalMasks(values);
  return { values, masks };
}
/** @param {number} cell */
const coordinate = (cell) => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;
const names = {
  "full-house": "最後空格（Full House）",
  "naked-single": "顯性單數",
  "hidden-single": "隱性單數",
  "naked-pair": "顯性數對",
  "hidden-pair": "隱性數對",
  pointing: "宮內指向",
  "box-line": "宮列交互",
  "naked-triple": "顯性三數組",
  "hidden-triple": "隱性三數組",
  "x-wing": "X-Wing",
  "chute-remote-pair": "Chute Remote Pair",
  "xy-wing": "XY-Wing",
  "w-wing": "W-Wing",
  "simple-colouring": "簡單著色",
  "naked-quad": "顯性四數組",
  "hidden-quad": "隱性四數組",
  swordfish: "Swordfish",
  "xyz-wing": "XYZ-Wing",
  jellyfish: "Jellyfish",
  "finned-x-wing": "Finned X-Wing",
  "finned-swordfish": "Finned Swordfish",
};
/** @param {import('../game/game.js').GameState} state @returns {import('./hint.js').Hint|null} */
export function findHint(state) {
  const { values, masks } = engineCandidates(state);
  if (!hasCompletion(values, masks)) throw new Error("Board has no completion");
  const step = findStep(values, masks);
  if (!step) return null;
  verifyStep(values, masks, step);
  const premiseCells = [...new Set(step.premiseCells)];
  const targets = [...new Set([...step.placements, ...step.eliminations].map((p) => p.cell))];
  const effect = [
    ...step.placements.map((p) => `${coordinate(p.cell)} 填入 ${p.digit}`),
    ...step.eliminations.map((p) => `${coordinate(p.cell)} 刪除 ${p.digit}`),
  ].join("；");
  const name = names[/** @type {keyof typeof names} */ (step.techniqueId)] || step.techniqueId;
  return {
    techniqueId: step.techniqueId,
    name,
    stages: [
      {
        title: `觀察 ${premiseCells.map(coordinate).join("、")}`,
        description: ["先比較這些格子的可信候選數；玩家筆記的漏記不會作為推理依據。"],
        coordinates: premiseCells,
      },
      { title: name, description: [step.reason], coordinates: premiseCells },
      { title: "這一步可以確定的結果", description: [effect], coordinates: targets },
    ],
    observeCells: premiseCells,
    premiseCells,
    premiseCandidates: premiseCells.flatMap((cell) =>
      maskDigits(masks[cell]).map((digit) => ({ cell, digit }))
    ),
    excludedCandidates: [],
    placements: step.placements,
    eliminations: step.eliminations,
    candidateMasks: [...masks],
    effect,
    proof: {
      version: 1,
      valuesKey: values.join(""),
      removed: legalMasks(values).map((m, i) => m & ~masks[i]),
      step,
    },
  };
}
