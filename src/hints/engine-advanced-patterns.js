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
const digits = (mask) => maskDigits(mask).join("、");
const cellOptions = (cs, masks) => cs.map((c) => `${label(c)} 可填 ${digits(masks[c])}`).join("；");
const house = (cs) => {
  if (cs.every((c) => rowOf(c) === rowOf(cs[0]))) return `第 ${rowOf(cs[0]) + 1} 橫列`;
  if (cs.every((c) => colOf(c) === colOf(cs[0]))) return `第 ${colOf(cs[0]) + 1} 直行`;
  return `第 ${boxOf(cs[0]) + 1} 宮`;
};
const relation = (a, b) => house([a, b]);
const result = (techniqueId, premiseCells, eliminations, teaching) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)].sort((a, b) => a - b),
  placements: [],
  eliminations,
  reason: [...teaching.observe, ...teaching.reasoning, ...teaching.conclusion].join(" "),
  teaching,
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
              {
                observeTitle: `先找出 ${digit} 的兩個必選位置`,
                observe: [
                  `${house(link)} 還沒填 ${digit}，而且只剩 ${labels(link)} 兩格能填。所以這兩格一定有一格是 ${digit}。`,
                  `再看第 ${boxOf(corner) + 1} 宮：這個宮的 ${digit} 只能放在 ${labels(positions)}。接下來檢查 ${label(target)} 能不能填 ${digit}。`,
                ],
                reasonTitle: `如果 ${label(target)} 填 ${digit}，會發生什麼？`,
                reasoning: [
                  `1. 假設 ${label(target)} 填 ${digit}。${label(hinge)} 和它同在${relation(target, hinge)}，就不能再填 ${digit}。`,
                  `2. ${house(link)} 的兩個位置只剩 ${label(other)}，因此 ${label(other)} 必須填 ${digit}。`,
                  `3. 第 ${boxOf(corner) + 1} 宮的每個位置都被擋住了：${positions.map((c) => `${label(c)} 與 ${label(sees(c, target) ? target : other)} 同在${relation(c, sees(c, target) ? target : other)}`).join("；")}，所以都不能填 ${digit}。`,
                ],
                conclusion: [
                  `每一宮都必須有 ${digit}，不能完全沒有位置可填。因此一開始的假設不成立，${label(target)} 不能填 ${digit}。`,
                ],
              }
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
        return result("wxyz-wing", group, eliminations, {
          observeTitle: "四個空格，合起來只有四種候選數",
          observe: [
            cellOptions(group, masks) + "。",
            `這四格合起來只有 ${digits(union)}。先問一個問題：它們能不能完全不填 ${digit}？`,
          ],
          reasonTitle: `少了 ${digit}，另外三個數字夠用嗎？`,
          reasoning: [
            ...maskDigits(union & ~bit(digit)).map((d, index) => {
              const places = group.filter((c) => masks[c] & bit(d));
              return `${index + 1}. ${d} 在這四格中只出現在 ${labels(places)}。${places.length === 1 ? "只有這一個位置，所以最多用一次。" : `任兩格都因同橫列、同直行或同宮而不能同時填 ${d}，所以最多用一次。`}`;
            }),
            `4. 如果四格都不填 ${digit}，就只剩三種數字，而且每種最多用一次，填不滿四格。因此 ${labels(positions)} 至少有一格必須填 ${digit}。`,
          ],
          conclusion: [
            `${eliminations.map((e) => label(e.cell)).join("、")} 都與 ${labels(positions)} 的每一格同在某一橫列、直行或宮。無論哪一格填 ${digit}，這些目標格都會和它衝突，所以不能填 ${digit}。`,
          ],
        });
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
            rejected.push({ x, y, witness });
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
        {
          observeTitle: `一起檢查 ${label(a)} 和 ${label(b)} 的填法`,
          observe: [
            `${cellOptions([a, b], masks)}。兩格同在${relation(a, b)}，所以不能填相同的數字。`,
            `周圍還有一些空格，同時受到這兩格影響：${used.map((s) => `${labels(s.cells)}（${s.cells.length} 格，只有 ${digits(s.mask)}）`).join("；")}。每組裡的格子在同一橫列、直行或宮，必須填不同的數字。`,
          ],
          reasonTitle: "假設目標候選成立，另一格還有選擇嗎？",
          reasoning: eliminations.flatMap(({ cell, digit }) => {
            const mate = cell === a ? b : a;
            return [
              `先假設 ${label(cell)} 填 ${digit}，逐一檢查 ${label(mate)} 的候選 ${digits(masks[mate])}：`,
              ...maskDigits(masks[mate]).map((otherDigit, index) => {
                if (digit === otherDigit)
                  return `${index + 1}. ${label(mate)} 不能填 ${otherDigit}，因為和 ${label(cell)} 同在${relation(cell, mate)}，會重複。`;
                const rejection = rejected.find(
                  (r) =>
                    r.x === (cell === a ? digit : otherDigit) &&
                    r.y === (cell === a ? otherDigit : digit)
                );
                const s = rejection.witness;
                const remaining = s.mask & ~(bit(digit) | bit(otherDigit));
                return `${index + 1}. 若 ${label(mate)} 填 ${otherDigit}，${labels(s.cells)} 每一格都和這兩個已填位置衝突，會一起失去 ${digit} 和 ${otherDigit}。${remaining ? `剩下 ${digits(remaining)}，只有 ${popcount(remaining)} 種數字，卻要填 ${s.cells.length} 個不能重複的空格` : "這格就沒有任何數字能填"}，所以也不行。`;
              }),
            ];
          }),
          conclusion: [
            `上述情況已涵蓋另一格的全部候選，每一種都會矛盾。因此 ${eliminations.map((e) => `${label(e.cell)} 填 ${e.digit}`).join("、")} 的假設不成立，可以刪除這些候選。`,
          ],
        }
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
