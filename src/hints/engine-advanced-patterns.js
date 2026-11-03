// Clean-room named patterns. These do not assume a unique solution.
// Definitions: https://www.sudokuwiki.org/Rectangle_Elimination,
// https://www.sudokuwiki.org/WXYZ_Wing and
// https://www.sudokuwiki.org/Aligned_Pair_Exclusion.
import { PEERS, bit, maskDigits, popcount, rowOf, colOf, boxOf } from "../game/board.js";
import { PATTERN_UNITS } from "./engine-patterns.js";

export const ADVANCED_PATTERN_TECHNIQUES = Object.freeze([
  "rectangle-elimination",
  "wxyz-wing",
  "aligned-pair-exclusion",
]);
const cells = Array.from({ length: 81 }, (_, i) => i);
const sees = (a, b) => PEERS[a].includes(b);
const label = (c) => `r${rowOf(c) + 1}c${colOf(c) + 1}`;
const labels = (cs) => cs.map(label).join("、");
const result = (techniqueId, premiseCells, eliminations, reason) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)].sort((a, b) => a - b),
  placements: [],
  eliminations,
  reason,
});
/** @param {number[]} items @param {number} n @returns {number[][]} */
function combinations(items, n) {
  const out = [];
  function visit(start, selected) {
    if (selected.length === n) {
      out.push(selected);
      return;
    }
    for (let i = start; i <= items.length - n + selected.length; i++)
      visit(i + 1, [...selected, items[i]]);
  }
  visit(0, []);
  return out;
}

// Standard row/column hinge plus fourth-corner box. Both the ordinary
// strong/weak form and the two-strong-links form follow the same contradiction.
// Extended chains and jigsaw/diagonal variants are deliberately out of scope.
function rectangle(masks, effects) {
  for (let digit = 1; digit <= 9; digit++) {
    for (const transposed of [false, true]) {
      const lineOf = transposed ? colOf : rowOf;
      const acrossOf = transposed ? rowOf : colOf;
      const unitOffset = transposed ? 9 : 0;
      for (let line = 0; line < 9; line++) {
        const link = PATTERN_UNITS[unitOffset + line].filter((c) => masks[c] & bit(digit));
        if (link.length !== 2 || boxOf(link[0]) === boxOf(link[1])) continue;
        for (const hinge of link) {
          const other = link.find((c) => c !== hinge);
          const targets = cells.filter(
            (c) =>
              effects[c] & bit(digit) &&
              acrossOf(c) === acrossOf(hinge) &&
              boxOf(c) !== boxOf(hinge)
          );
          for (const target of targets) {
            const corner = transposed
              ? acrossOf(other) * 9 + lineOf(target)
              : lineOf(target) * 9 + acrossOf(other);
            const box = PATTERN_UNITS[18 + boxOf(corner)];
            const positions = box.filter((c) => masks[c] & bit(digit));
            if (
              box.includes(target) ||
              box.includes(other) ||
              positions.length < 2 ||
              !positions.every((c) => sees(c, target) || sees(c, other)) ||
              !positions.some((c) => sees(c, target) && !sees(c, other)) ||
              !positions.some((c) => sees(c, other) && !sees(c, target))
            )
              continue;
            return result(
              "rectangle-elimination",
              [hinge, other, ...positions],
              [{ cell: target, digit }],
              `${labels(link)} 是同一線上 ${digit} 唯二的位置。若 ${label(target)} 填 ${digit}，${label(hinge)} 就不能填 ${digit}，因此 ${label(other)} 必須填 ${digit}。這兩個 ${digit} 會共同排除第四角所在宮的全部位置 ${labels(positions)}，使該宮無處填 ${digit}，所以 ${label(target)} 不能填 ${digit}。`
            );
          }
        }
      }
    }
  }
  return null;
}

// General Type 1: four cells/four digits covered by two intersecting units,
// exactly one non-restricted digit. Includes row+column, not just line+box.
// The newer all-restricted Type 2 extension is not claimed here.
function wxyz(masks, effects) {
  const seen = new Set();
  for (let a = 0; a < PATTERN_UNITS.length; a++) {
    for (let b = a + 1; b < PATTERN_UNITS.length; b++) {
      const one = PATTERN_UNITS[a],
        two = PATTERN_UNITS[b];
      if (!one.some((c) => two.includes(c))) continue;
      const eligible = [...new Set([...one, ...two])].filter(
        (c) => popcount(masks[c]) >= 2 && popcount(masks[c]) <= 4
      );
      for (const group of combinations(eligible, 4)) {
        if (group.every((c) => one.includes(c)) || group.every((c) => two.includes(c))) continue;
        group.sort((x, y) => x - y);
        const key = group.join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const union = group.reduce((m, c) => m | masks[c], 0);
        if (popcount(union) !== 4) continue;
        const unrestricted = maskDigits(union).filter((d) => {
          const positions = group.filter((c) => masks[c] & bit(d));
          return positions.some((c, i) => positions.slice(i + 1).some((p) => !sees(c, p)));
        });
        if (unrestricted.length !== 1) continue;
        const digit = unrestricted[0];
        const positions = group.filter((c) => masks[c] & bit(digit));
        const eliminations = cells
          .filter(
            (c) =>
              effects[c] & bit(digit) && !group.includes(c) && positions.every((p) => sees(c, p))
          )
          .map((cell) => ({ cell, digit }));
        if (!eliminations.length) continue;
        return result(
          "wxyz-wing",
          group,
          eliminations,
          `${labels(group)} 四格合起來只有 ${maskDigits(union).join("、")}，並由兩個相交單位覆蓋。除了 ${digit}，每個數字在這四格的所有位置都互相可見，因此各最多填一格。四格不能只用另外三個數字，所以 ${labels(positions)} 至少有一格填 ${digit}；看見它們全部的目標格不能填 ${digit}。`
        );
      }
    }
  }
  return null;
}

// Aligned (mutually visible) base pairs and common-peer ALSs of 1..3 cells.
// Removing two different ALS digits would leave n cells with at most n-1
// digits. Enumerate every base assignment, retaining only combinations not
// excluded by that local Hall contradiction. No solving/search oracle is used.
function alignedPair(masks, effects) {
  const eligible = cells.filter((c) => popcount(masks[c]) >= 2);
  for (const a of eligible) {
    for (const b of PEERS[a]) {
      if (b <= a || popcount(masks[b]) < 2 || !(effects[a] || effects[b])) continue;
      const common = PEERS[a].filter(
        (c) => sees(c, b) && popcount(masks[c]) >= 2 && popcount(masks[c]) <= 4
      );
      const sets = [];
      const seen = new Set();
      for (const unit of PATTERN_UNITS) {
        const available = common.filter((c) => unit.includes(c));
        for (let size = 1; size <= Math.min(3, available.length); size++) {
          for (const group of combinations(available, size)) {
            const union = group.reduce((m, c) => m | masks[c], 0);
            if (popcount(union) !== size + 1) continue;
            const key = group.join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            sets.push({ cells: group, mask: union });
          }
        }
      }
      if (!sets.length) continue;
      let allowedA = 0,
        allowedB = 0;
      const witnesses = new Set();
      const rejected = [];
      for (const x of maskDigits(masks[a])) {
        for (const y of maskDigits(masks[b])) {
          if (x === y) continue;
          const pair = bit(x) | bit(y);
          const witness = sets.find((s) => (s.mask & pair) === pair);
          if (witness) {
            witnesses.add(witness);
            rejected.push(`${x}/${y}`);
          } else {
            allowedA |= bit(x);
            allowedB |= bit(y);
          }
        }
      }
      // An inconsistent local model is not a usable teaching proof.
      if (!allowedA || !allowedB) continue;
      const eliminations = [a, b].flatMap((cell) =>
        maskDigits(effects[cell] & ~(cell === a ? allowedA : allowedB)).map((digit) => ({
          cell,
          digit,
        }))
      );
      if (!eliminations.length) continue;
      const used = [...witnesses];
      return result(
        "aligned-pair-exclusion",
        [a, b, ...used.flatMap((s) => s.cells)],
        eliminations,
        `${labels([a, b])} 互相可見，不能填同一數字，且都看見這些幾乎鎖定組：${used.map((s) => `${labels(s.cells)}（${s.cells.length} 格、候選 ${maskDigits(s.mask).join("、")}）`).join("；")}。若兩格取值為 ${rejected.join("、")}，至少一組會同時失去兩個數字，留下的數字少於格數，因此這些組合不可能。列舉其餘全部組合後，目標候選未出現在任何可行組合中，可以刪除。`
      );
    }
  }
  return null;
}

/** @param {number[]} values @param {number[]} masks @param {string} techniqueId
 * @param {number[]} [effectMasks] @returns {import('./proof-verifier.js').Step|null} */
export function detectAdvancedPattern(values, masks, techniqueId, effectMasks = masks) {
  if (values.length !== 81 || masks.length !== 81 || effectMasks.length !== 81)
    throw new TypeError("Expected 81 values and candidate masks");
  const effects = masks.map((mask, cell) => mask & effectMasks[cell]);
  if (!effects.some(Boolean)) return null;
  switch (techniqueId) {
    case "rectangle-elimination":
      return rectangle(masks, effects);
    case "wxyz-wing":
      return wxyz(masks, effects);
    case "aligned-pair-exclusion":
      return alignedPair(masks, effects);
    default:
      return null;
  }
}
