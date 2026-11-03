// Clean-room direct Sudoku patterns. Only certified candidate masks may enter here.
import { ALL_DIGITS, bit, maskDigits, popcount, rowOf, colOf, boxOf } from "../game/board.js";

/** @typedef {{cell:number,digit:number}} Candidate */
/** @typedef {{techniqueId:string,premiseCells:number[],placements:Candidate[],eliminations:Candidate[],reason:string}} Pattern */

export const PATTERN_TECHNIQUES = Object.freeze([
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
  "naked-quad",
  "hidden-quad",
  "swordfish",
  "jellyfish",
  "finned-x-wing",
  "finned-swordfish",
]);
const IDS = new Set(PATTERN_TECHNIQUES);
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const PATTERN_UNITS = Object.freeze(
  [
    ...INDEXES.map((r) => INDEXES.map((c) => r * 9 + c)),
    ...INDEXES.map((c) => INDEXES.map((r) => r * 9 + c)),
    ...INDEXES.map((b) =>
      INDEXES.map((k) => Math.floor(b / 3) * 27 + (b % 3) * 3 + Math.floor(k / 3) * 9 + (k % 3))
    ),
  ].map((u) => Object.freeze(u))
);
/** @param {number[]} items @param {number} n @returns {number[][]} */
function combinations(items, n) {
  /** @type {number[][]} */ const out = [];
  /** @param {number} start @param {number[]} selected */
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
/** @param {number[]} cells */
const coordinates = (cells) => cells.map((c) => `r${rowOf(c) + 1}c${colOf(c) + 1}`).join("、");
/** @param {string} id @param {number[]} premises @param {Candidate[]} placements @param {Candidate[]} eliminations @param {string} reason @returns {Pattern} */
const result = (id, premises, placements, eliminations, reason) => ({
  techniqueId: id,
  premiseCells: [...new Set(premises)].sort((a, b) => a - b),
  placements,
  eliminations,
  reason,
});
/** @param {readonly number[]} masks @param {readonly number[]} cells @param {number} digits @returns {Candidate[]} */
const removals = (masks, cells, digits) =>
  cells.flatMap((cell) => maskDigits(masks[cell] & digits).map((digit) => ({ cell, digit })));

/**
 * Search one exact named pattern, independent of player notes and search order.
 * Assumes a consistent Sudoku and sound masks; returns only effective steps.
 * @param {readonly number[]} values @param {readonly number[]} masks @param {string} techniqueId
 * @returns {Pattern|null}
 */
export function detectPattern(values, masks, techniqueId) {
  if (!IDS.has(techniqueId)) throw new Error(`Unknown direct pattern: ${techniqueId}`);
  if (
    values.length !== 81 ||
    masks.length !== 81 ||
    values.some((v) => !Number.isInteger(v) || v < 0 || v > 9) ||
    masks.some(
      (m, i) =>
        !Number.isInteger(m) || m < 0 || (m & ~ALL_DIGITS) !== 0 || (values[i] !== 0 && m !== 0)
    )
  )
    throw new Error("Invalid candidate board");
  const id = techniqueId;
  if (id === "naked-single") {
    const cell = masks.findIndex((m) => popcount(m) === 1);
    if (cell >= 0) {
      const digit = maskDigits(masks[cell])[0];
      return result(
        id,
        [cell],
        [{ cell, digit }],
        [],
        `${coordinates([cell])} 只剩候選數 ${digit}，因此必須填入 ${digit}。`
      );
    }
  }
  if (id === "full-house" || id === "hidden-single") {
    for (const unit of PATTERN_UNITS) {
      const empty = unit.filter((c) => !values[c]);
      if (id === "full-house") {
        if (empty.length !== 1) continue;
        const missing = DIGITS.filter((d) => !unit.some((c) => values[c] === d));
        if (missing.length === 1 && masks[empty[0]] & bit(missing[0]))
          return result(
            id,
            [...unit],
            [{ cell: empty[0], digit: missing[0] }],
            [],
            `這個區域只剩 ${coordinates(empty)} 未填，缺少的數字是 ${missing[0]}。`
          );
      } else
        for (const digit of DIGITS) {
          if (unit.some((c) => values[c] === digit)) continue;
          const spots = empty.filter((c) => masks[c] & bit(digit));
          if (spots.length === 1)
            return result(
              id,
              [...unit],
              [{ cell: spots[0], digit }],
              [],
              `這個區域只有 ${coordinates(spots)} 能填 ${digit}，因此必須在此填入 ${digit}。`
            );
        }
    }
  }
  const size = id.endsWith("pair") ? 2 : id.endsWith("triple") ? 3 : id.endsWith("quad") ? 4 : 0;
  if (size && (id.startsWith("naked-") || id.startsWith("hidden-"))) {
    for (const unit of PATTERN_UNITS) {
      const empty = unit.filter((c) => !values[c]);
      if (id.startsWith("naked-")) {
        for (const cells of combinations(
          empty.filter((c) => popcount(masks[c]) >= 2 && popcount(masks[c]) <= size),
          size
        )) {
          const union = cells.reduce((m, c) => m | masks[c], 0);
          if (popcount(union) !== size) continue;
          const eliminated = removals(
            masks,
            empty.filter((c) => !cells.includes(c)),
            union
          );
          if (eliminated.length)
            return result(
              id,
              cells,
              [],
              eliminated,
              `${coordinates(cells)} 的候選數合起來只有 ${maskDigits(union).join("、")}。這 ${size} 格必須占用這 ${size} 個數字，同區域其他格可刪除它們。`
            );
        }
      } else {
        const available = DIGITS.filter(
          (d) => !unit.some((c) => values[c] === d) && empty.some((c) => masks[c] & bit(d))
        );
        for (const digits of combinations(available, size)) {
          const selectedMask = digits.reduce((m, d) => m | bit(d), 0);
          const cells = empty.filter((c) => masks[c] & selectedMask);
          if (cells.length !== size) continue;
          const eliminated = removals(masks, cells, ALL_DIGITS & ~selectedMask);
          if (eliminated.length)
            return result(
              id,
              [...unit],
              [],
              eliminated,
              `這個區域的 ${digits.join("、")} 只出現在 ${coordinates(cells)}。這 ${size} 個數字必須占用這 ${size} 格，因此這些格可刪除其他候選數。`
            );
        }
      }
    }
  }
  if (id === "pointing" || id === "box-line") {
    const sources = id === "pointing" ? PATTERN_UNITS.slice(18) : PATTERN_UNITS.slice(0, 18);
    for (const unit of sources)
      for (const digit of DIGITS) {
        const cells = unit.filter((c) => masks[c] & bit(digit));
        if (cells.length < 2) continue;
        const targets =
          id === "pointing"
            ? [PATTERN_UNITS[rowOf(cells[0])], PATTERN_UNITS[9 + colOf(cells[0])]]
            : [PATTERN_UNITS[18 + boxOf(cells[0])]];
        for (const target of targets) {
          if (!cells.every((c) => target.includes(c))) continue;
          const eliminated = removals(
            masks,
            target.filter((c) => !unit.includes(c)),
            bit(digit)
          );
          if (eliminated.length)
            return result(
              id,
              [...unit],
              [],
              eliminated,
              `來源區域的 ${digit} 只可能在 ${coordinates(cells)}，而它們也位於同一${id === "pointing" ? "橫列或直行" : "宮"}。因此目標區域中來源區域以外的格可刪除 ${digit}。`
            );
        }
      }
  }
  const fishSize =
    id === "x-wing" || id === "finned-x-wing"
      ? 2
      : id === "swordfish" || id === "finned-swordfish"
        ? 3
        : id === "jellyfish"
          ? 4
          : 0;
  if (fishSize) return fish(masks, id, fishSize, id.startsWith("finned-"));
  return null;
}

/** @param {readonly number[]} masks @param {string} id @param {number} n @param {boolean} finned @returns {Pattern|null} */
function fish(masks, id, n, finned) {
  for (const digit of DIGITS)
    for (const transposed of [false, true]) {
      /** @param {number} base @param {number} cover */
      const cellAt = (base, cover) => (transposed ? cover * 9 + base : base * 9 + cover);
      const spots = INDEXES.map((b) => INDEXES.filter((c) => masks[cellAt(b, c)] & bit(digit)));
      const eligible = INDEXES.filter(
        (b) => spots[b].length >= 2 && (finned || spots[b].length <= n)
      );
      for (const bases of combinations(eligible, n)) {
        const union = [...new Set(bases.flatMap((b) => spots[b]))];
        if ((!finned && union.length !== n) || (finned && union.length <= n)) continue;
        const coverChoices = finned ? combinations(union, n) : [union];
        for (const covers of coverChoices) {
          const core = bases.flatMap((b) =>
            spots[b].filter((c) => covers.includes(c)).map((c) => cellAt(b, c))
          );
          // Every base and cover has at least two core positions: excludes sashimi
          // and reduced/degenerated fish from these exact technique labels.
          if (
            bases.some((b) => covers.filter((c) => masks[cellAt(b, c)] & bit(digit)).length < 2) ||
            covers.some((c) => bases.filter((b) => masks[cellAt(b, c)] & bit(digit)).length < 2)
          )
            continue;
          const fins = bases.flatMap((b) =>
            spots[b].filter((c) => !covers.includes(c)).map((c) => cellAt(b, c))
          );
          if (finned && (!fins.length || fins.some((c) => boxOf(c) !== boxOf(fins[0])))) continue;
          const targets = INDEXES.filter((b) => !bases.includes(b))
            .flatMap((b) => covers.map((c) => cellAt(b, c)))
            .filter((c) => !finned || boxOf(c) === boxOf(fins[0]));
          const eliminated = removals(masks, targets, bit(digit));
          if (!eliminated.length) continue;
          const reason = finned
            ? `候選數 ${digit} 的魚形本體為 ${coordinates(core)}，鰭為同宮的 ${coordinates(fins)}。若鰭成立，同宮目標不能是 ${digit}；若鰭全部不成立，${n} 個來源線必須占用 ${n} 個覆蓋線，目標仍不能是 ${digit}。`
            : `候選數 ${digit} 在 ${n} 個來源線中只落在 ${n} 個覆蓋線，位置是 ${coordinates(core)}。這些來源線必須各放一個 ${digit}，因此覆蓋線中其餘格可刪除 ${digit}。`;
          return result(id, [...core, ...fins], [], eliminated, reason);
        }
      }
    }
  return null;
}
