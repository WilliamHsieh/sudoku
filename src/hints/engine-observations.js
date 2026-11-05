import { rowOf, colOf, boxOf, maskDigits, bit } from "../game/board.js";

/** @param {number} cell */
const coordinate = (cell) => `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;
/** @param {number[]} cells */
function unitName(cells) {
  for (const { position, name } of [
    { position: rowOf, name: "橫列" },
    { position: colOf, name: "直行" },
    { position: boxOf, name: "宮" },
  ]) {
    if (cells.every((cell) => position(cell) === position(cells[0])))
      return `第 ${position(cells[0]) + 1} ${name}`;
  }
  return "這個區域";
}

const titles = {
  "naked-pair": "比較兩格的候選數",
  "hidden-pair": "找出兩個數字出現的位置",
  pointing: "留意宮內候選數的排列",
  "box-line": "留意同一線上的候選數位置",
  "naked-triple": "比較三格的候選數",
  "hidden-triple": "找出三個數字出現的位置",
  "x-wing": "比較兩條線上的候選數位置",
  "chute-remote-pair": "找出同一帶中的相同數對",
  "xy-wing": "比較樞紐與兩翼的候選數",
  "w-wing": "找出相同數對與兩位置連結",
  "simple-colouring": "從只有兩個位置的候選數開始",
  "naked-quad": "比較四格的候選數",
  "hidden-quad": "找出四個數字出現的位置",
  swordfish: "比較三條線上的候選數位置",
  "xyz-wing": "比較樞紐與兩翼的候選數",
  jellyfish: "比較四條線上的候選數位置",
  "finned-x-wing": "找出魚形本體與額外的候選位置",
  "finned-swordfish": "找出魚形本體與額外的候選位置",
};

/**
 * Presentation only: keep the detector's factual setup, without its deduction.
 * The earlier detectors put that setup in the first sentence (the first two
 * for W-Wing). Tests cover every such technique so copy changes cannot silently
 * turn an observation into an elimination. Singles get an earlier starting
 * point rather than copying the detector's placement instruction.
 * @param {import('./proof-verifier.js').Step} step
 * @param {number[]} values
 * @param {number[]} masks
 * @returns {{title: string, description: string[]}}
 */
export function firstObservation(step, values, masks) {
  const unit = unitName(step.premiseCells);
  if (step.techniqueId === "full-house") {
    const cell = step.placements[0].cell;
    const filled = step.premiseCells.map((c) => values[c]).filter(Boolean);
    return {
      title: `找出${unit}缺少的數字`,
      description: [`${unit}已有 ${filled.join("、")}，只剩 ${coordinate(cell)} 一格空白。`],
    };
  }
  if (step.techniqueId === "naked-single") {
    const cell = step.placements[0].cell;
    return {
      title: `看看 ${coordinate(cell)} 還有哪些候選數`,
      description: [`${coordinate(cell)} 目前只剩候選數 ${maskDigits(masks[cell]).join("、")}。`],
    };
  }
  if (step.techniqueId === "hidden-single") {
    const digit = step.placements[0].digit;
    const empty = step.premiseCells.filter((cell) => !values[cell]);
    return {
      title: `找出${unit}中 ${digit} 的位置`,
      description: [
        `${unit}還有 ${empty.length} 格空白，但候選數 ${digit} 只出現在其中一格。先找出是哪一格。`,
      ],
    };
  }
  if (step.techniqueId === "pointing" || step.techniqueId === "box-line") {
    const digit = step.eliminations[0].digit;
    const spots = step.premiseCells.filter((cell) => masks[cell] & bit(digit));
    const shared =
      step.techniqueId === "pointing" ? unitName(spots) : `第 ${boxOf(spots[0]) + 1} 宮`;
    return {
      title: titles[step.techniqueId],
      description: [
        `${unit}的候選數 ${digit} 只出現在 ${spots.map(coordinate).join("、")}，這些格都位於${shared}。`,
      ],
    };
  }
  const facts = step.reason.split("。").slice(0, step.techniqueId === "w-wing" ? 2 : 1);
  return {
    title: titles[/** @type {keyof typeof titles} */ (step.techniqueId)] ?? "觀察候選數的分布",
    description: facts.map((fact) => `${fact.replace(/^(這個區域|來源區域)/, unit)}。`),
  };
}
