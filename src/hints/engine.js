import { detectPattern, PATTERN_TECHNIQUES } from "./engine-patterns.js";
import { detectChain } from "./engine-chains.js";
import { ADVANCED_TECHNIQUES, detectAdvanced } from "./engine-advanced.js";
import {
  legalMasks,
  validateMasks,
  verifyStep,
  verifyLedger,
  hasCompletion,
} from "./proof-verifier.js";
import { candidates } from "../game/game.js";
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
  ...ADVANCED_TECHNIQUES,
];
/** @param {number[]} values @param {number[]} masks @param {string} [techniqueId] @param {number[]} [effectMasks] @returns {import('./proof-verifier.js').Step|null} */
export function findStep(values, masks, techniqueId, effectMasks = masks) {
  validateMasks(values, masks);
  const ids = techniqueId ? [techniqueId] : TECHNIQUES;
  for (const id of ids) {
    if (!TECHNIQUES.includes(id)) throw new Error("Unsupported technique");
    const step = PATTERN_TECHNIQUES.includes(id)
      ? detectPattern(values, masks, id, effectMasks)
      : ADVANCED_TECHNIQUES.includes(id)
        ? detectAdvanced(values, masks, id, effectMasks)
        : detectChain(values, masks, id, effectMasks);
    if (step) return step;
  }
  return null;
}
/** @param {import('../game/game.js').GameState} state */
export function engineCandidates(state) {
  const values = state.givens.map((v, i) => v || state.answers[i]);
  const legal = legalMasks(values);
  const visible = values.map((_, cell) => candidates(state, cell));
  // Auto is a complete candidate workspace: the player explicitly owns its
  // omissions. Never import those assumptions into Tidy's verified ledger.
  if (state.notesMode === "auto")
    return { values, masks: legal.map((mask, cell) => mask & visible[cell]) };
  const ledger = state.trustedEliminations;
  const trusted =
    ledger && ledger.valuesKey === values.join("") ? verifyLedger(values, ledger.removed) : legal;
  // Re-adding a certified candidate makes its deduction actionable again.
  // Missing Tidy notes alone never establish a logical exclusion.
  const masks = trusted.map((mask, cell) => mask | (legal[cell] & visible[cell]));
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
  "rectangle-elimination": "Rectangle Elimination",
  "x-cycles": "X-Cycles",
  "xy-chain": "XY-Chain",
  "3d-medusa": "3D Medusa",
  "wxyz-wing": "WXYZ-Wing",
  "aligned-pair-exclusion": "Aligned Pair Exclusion",
  "grouped-x-cycles": "Grouped X-Cycles",
  aic: "交替推理鏈（AIC）",
  "als-xz": "ALS-XZ",
  "als-xy-wing": "ALS-XY-Wing",
  "death-blossom": "Death Blossom",
  "sue-de-coq": "Sue de Coq",
};
/** @param {import('../game/game.js').GameState} state @returns {import('./hint.js').Hint|null} */
export function findHint(state) {
  if (state.notesMode === "manual") return null;
  const { values, masks } = engineCandidates(state);
  if (!hasCompletion(values, masks)) throw new Error("Board has no completion");
  const visibleMasks = values.map((_, cell) => candidates(state, cell));
  const step = findStep(values, masks, undefined, visibleMasks);
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
        description: [
          state.notesMode === "auto"
            ? "以目前盤面與 Auto 候選數推理；已刪除的候選數會視為你的判斷。"
            : "以目前盤面及已驗證的刪除推理；未寫下的筆記不視為排除。",
        ],
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
      source: state.notesMode === "auto" ? "player" : "board",
      valuesKey: values.join(""),
      removed: legalMasks(values).map((m, i) => m & ~masks[i]),
      step,
    },
  };
}
