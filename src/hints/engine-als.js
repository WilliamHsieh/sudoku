// Clean-room bounded ALS patterns, from the mathematical definitions at
// https://hodoku.sourceforge.net/en/tech_als.php and /en/tech_misc.php.
// No search for a Sudoku completion is used to discover or name a pattern.
// Bounds: each ALS has 1–4 multivalue cells in one house; an ALS-XY-Wing has
// three ALS; a Death Blossom has a 2–4-candidate stem and one ALS per candidate.
// Sue de Coq uses 2–3 intersection cells and 1–4 cells in each support sector.
import {
  ALL_DIGITS,
  PEERS,
  bit,
  maskDigits,
  popcount,
  rowOf,
  colOf,
  boxOf,
} from "../game/board.js";

export const ALS_TECHNIQUES = Object.freeze([
  "als-xz",
  "als-xy-wing",
  "death-blossom",
  "sue-de-coq",
]);

const cells = Array.from({ length: 81 }, (_, i) => i);
const cellBits = cells.map((c) => 1n << BigInt(c));
const allCells = (1n << 81n) - 1n;
const peerBits = PEERS.map((ps) => ps.reduce((out, c) => out | cellBits[c], 0n));
const houses = [rowOf, colOf, boxOf].flatMap((f) =>
  Array.from({ length: 9 }, (_, i) => cells.filter((c) => f(c) === i))
);
const label = (c) => `r${rowOf(c) + 1}c${colOf(c) + 1}`;
const labels = (cs) => cs.map(label).join("、");
const digits = (mask) => maskDigits(mask).join("、");
const describe = (a) => `${labels(a.cells)}（${a.cells.length} 格，候選 ${digits(a.mask)}）`;
const result = (techniqueId, premiseCells, eliminations, reason) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)],
  placements: [],
  eliminations,
  reason,
});

/** @typedef {{cells:number[],mask:number,cellMask:bigint}} CellSet */
/** @typedef {CellSet & {positions:bigint[],sight:bigint[]}} AlmostLockedSet */

/** Enumerate bounded subsets, without any assignments or solution search.
 * @param {number[]} pool @param {number[]} masks @param {number} limit
 * @param {number} [maxDigits] @returns {CellSet[]}
 */
function subsets(pool, masks, limit, maxDigits = 9) {
  /** @type {CellSet[]} */
  const out = [];
  /** @param {number} start @param {number[]} selected @param {number} mask @param {bigint} cellMask */
  function visit(start, selected, mask, cellMask) {
    for (let i = start; i < pool.length; i++) {
      const c = pool[i];
      const nextMask = mask | masks[c];
      if (popcount(nextMask) > maxDigits) continue;
      const next = [...selected, c];
      const nextCells = cellMask | cellBits[c];
      out.push({ cells: next, mask: nextMask, cellMask: nextCells });
      if (next.length < limit) visit(i + 1, next, nextMask, nextCells);
    }
  }
  visit(0, [], 0, 0n);
  return out;
}

/** @param {number[]} values @param {number[]} masks @returns {AlmostLockedSet[]} */
function almostLockedSets(values, masks) {
  const out = [];
  const seen = new Set();
  for (const house of houses) {
    const pool = house.filter((c) => !values[c] && popcount(masks[c]) >= 2);
    for (const set of subsets(pool, masks, 4, 5)) {
      if (popcount(set.mask) !== set.cells.length + 1 || seen.has(set.cellMask)) continue;
      seen.add(set.cellMask);
      const positions = Array(10).fill(0n);
      const sight = Array(10).fill(0n);
      for (const d of maskDigits(set.mask)) {
        sight[d] = allCells;
        for (const c of set.cells)
          if (masks[c] & bit(d)) {
            positions[d] |= cellBits[c];
            sight[d] &= peerBits[c];
          }
      }
      out.push({ ...set, positions, sight });
    }
  }
  return out;
}

/** @param {AlmostLockedSet} a @param {AlmostLockedSet} b */
function restricted(a, b) {
  let out = 0;
  for (const d of maskDigits(a.mask & b.mask))
    if ((a.positions[d] & b.sight[d]) === a.positions[d]) out |= bit(d);
  return out;
}

/** @param {bigint[]} visible @param {bigint} targets @param {number} digit */
function effects(visible, targets, digit) {
  const hits = visible[digit] & targets;
  return hits ? cells.filter((c) => hits & cellBits[c]).map((cell) => ({ cell, digit })) : [];
}

/** @param {AlmostLockedSet[]} sets @param {bigint[]} visible */
function alsXZ(sets, visible) {
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i],
        b = sets[j];
      const common = a.mask & b.mask;
      if (popcount(common) < 2) continue;
      const rcc = restricted(a, b);
      if (!rcc) continue;
      const outside = ~(a.cellMask | b.cellMask);
      for (const x of maskDigits(rcc)) {
        const out = maskDigits(common & ~bit(x)).flatMap((z) =>
          effects(visible, a.sight[z] & b.sight[z] & outside, z)
        );
        if (out.length)
          return result(
            "als-xz",
            [...a.cells, ...b.cells],
            out,
            `兩個近鎖定數組為 ${describe(a)} 和 ${describe(b)}。共同候選 ${x} 在兩組的所有位置互相可見，不能兩組都使用；因此至少一組失去 ${x}，其餘候選必須全部出現。目標看見兩組中被刪數字的所有位置，所以不能填該數字。`
          );
      }
      // Two RCCs force one into each ALS, locking every non-RCC in its own ALS.
      // Three RCCs would contradict a consistent candidate model; skip it.
      if (popcount(rcc) !== 2) continue;
      const out = maskDigits(rcc).flatMap((d) =>
        effects(visible, a.sight[d] & b.sight[d] & outside, d)
      );
      for (const set of [a, b])
        for (const d of maskDigits(set.mask & ~rcc))
          out.push(...effects(visible, set.sight[d] & outside, d));
      if (out.length)
        return result(
          "als-xz",
          [...a.cells, ...b.cells],
          out,
          `兩個近鎖定數組為 ${describe(a)} 和 ${describe(b)}，受限共同候選是 ${digits(rcc)}。兩數不能同時落在同一組，否則另一組會少兩個數；因此兩組各用其中一數，各自其餘候選也全部鎖定。可刪除看見相應數字所有位置的外部候選。`
        );
    }
  return null;
}

/** @param {AlmostLockedSet[]} sets @param {bigint[]} visible */
function alsXYWing(sets, visible) {
  const links = sets.map(() => []);
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const rcc = restricted(sets[i], sets[j]);
      if (rcc) {
        links[i].push({ other: j, rcc });
        links[j].push({ other: i, rcc });
      }
    }
  for (let p = 0; p < sets.length; p++) {
    const pivot = sets[p];
    for (let i = 0; i < links[p].length; i++)
      for (let j = i + 1; j < links[p].length; j++) {
        const left = links[p][i],
          right = links[p][j];
        const a = sets[left.other],
          b = sets[right.other];
        const common = a.mask & b.mask;
        if (!common) continue;
        const outside = ~(pivot.cellMask | a.cellMask | b.cellMask);
        for (const x of maskDigits(left.rcc))
          for (const y of maskDigits(right.rcc)) {
            if (x === y) continue;
            const out = maskDigits(common & ~bit(x) & ~bit(y)).flatMap((z) =>
              effects(visible, a.sight[z] & b.sight[z] & outside, z)
            );
            if (out.length)
              return result(
                "als-xy-wing",
                [...a.cells, ...pivot.cells, ...b.cells],
                out,
                `三個近鎖定數組依序為 A：${describe(a)}；中間組：${describe(pivot)}；B：${describe(b)}。A 與中間組以 ${x} 受限連結，B 與中間組以不同的 ${y} 受限連結。若某個共同數字在兩翼都缺少，A 必用 ${x}、B 必用 ${y}，中間組便少兩個數而無法填滿。因此兩翼至少一組使用該數，所有位置的共同可見格可刪除它。`
              );
          }
      }
  }
  return null;
}

/** @param {number[]} values @param {number[]} masks @param {AlmostLockedSet[]} sets @param {bigint[]} visible */
function deathBlossom(values, masks, sets, visible) {
  for (const stem of cells) {
    const stemDigits = maskDigits(masks[stem]);
    if (values[stem] || stemDigits.length < 2 || stemDigits.length > 4) continue;
    const options = stemDigits.map((d) =>
      sets.filter(
        (set) =>
          !(set.cellMask & cellBits[stem]) && set.mask & bit(d) && set.sight[d] & cellBits[stem]
      )
    );
    if (options.some((petals) => !petals.length)) continue;
    for (const z of maskDigits(ALL_DIGITS & ~masks[stem])) {
      let targets = visible[z] & ~cellBits[stem];
      for (const petals of options) {
        let covered = 0n;
        for (const petal of petals) if (petal.mask & bit(z)) covered |= petal.sight[z];
        targets &= covered;
      }
      if (!targets) continue;
      const target = cells.find((c) => targets & cellBits[c]);
      // Each branch is independent. Petals may overlap: any one true stem
      // candidate alone locks its corresponding petal and therefore forces z.
      const chosen = options.map((petals) =>
        petals.find((set) => set.mask & bit(z) && set.sight[z] & cellBits[target])
      );
      let commonSight = allCells;
      let premises = cellBits[stem];
      for (const petal of chosen) {
        commonSight &= petal.sight[z];
        premises |= petal.cellMask;
      }
      const out = effects(visible, commonSight & ~premises, z);
      if (out.length)
        return result(
          "death-blossom",
          [stem, ...chosen.flatMap((set) => set.cells)],
          out,
          `主幹 ${label(stem)} 只有 ${digits(masks[stem])}。` +
            chosen
              .map(
                (petal, i) =>
                  `若主幹填 ${stemDigits[i]}，花瓣 ${describe(petal)} 會失去 ${stemDigits[i]} 並鎖定其餘數字。`
              )
              .join("") +
            `每片花瓣都有 ${z}，而 ${z} 不是主幹候選；不論主幹取何值，至少一片花瓣必填 ${z}，所以看見各花瓣全部 ${z} 位置的格子不能填 ${z}。`
        );
    }
  }
  return null;
}

/** @param {number[]} values @param {number[]} masks @param {bigint[]} visible */
function sueDeCoq(values, masks, visible) {
  for (let lineIndex = 0; lineIndex < 18; lineIndex++) {
    const line = houses[lineIndex];
    for (let boxIndex = 18; boxIndex < 27; boxIndex++) {
      const box = houses[boxIndex];
      const intersection = line.filter((c) => box.includes(c) && !values[c]);
      if (intersection.length < 2) continue;
      for (const center of subsets(intersection, masks, 3)) {
        if (center.cells.length < 2 || popcount(center.mask) < center.cells.length + 2) continue;
        const support = (house) =>
          subsets(
            house.filter(
              (c) => !values[c] && !(center.cellMask & cellBits[c]) && popcount(masks[c]) >= 2
            ),
            masks,
            4
          ).filter(
            (set) =>
              popcount(set.mask) > set.cells.length &&
              // Leave room for the other sector's positive deficit. This is
              // implied by the exact count, not an arbitrary search budget.
              popcount(set.mask) - set.cells.length < center.cells.length &&
              popcount(set.mask & center.mask) >= 2 &&
              popcount(set.mask & center.mask) <= popcount(center.mask) - 2
          );
        const rowSets = support(line),
          boxSets = support(box);
        for (const rowSet of rowSets)
          for (const boxSet of boxSets) {
            if (rowSet.mask & boxSet.mask & center.mask || rowSet.cellMask & boxSet.cellMask)
              continue;
            // External digits are counted once per sector. They may be shared
            // by the sectors, unlike any candidate present in the intersection.
            const capacity =
              popcount(center.mask) +
              popcount(rowSet.mask & ~center.mask) +
              popcount(boxSet.mask & ~center.mask);
            if (capacity !== center.cells.length + rowSet.cells.length + boxSet.cells.length)
              continue;
            const premiseBits = center.cellMask | rowSet.cellMask | boxSet.cellMask;
            const lineTargets = line.reduce((all, c) => all | cellBits[c], 0n) & ~premiseBits;
            const boxTargets = box.reduce((all, c) => all | cellBits[c], 0n) & ~premiseBits;
            const lineDigits = rowSet.mask | (center.mask & ~boxSet.mask);
            const boxDigits = boxSet.mask | (center.mask & ~rowSet.mask);
            const out = [];
            for (const d of maskDigits(lineDigits | boxDigits))
              out.push(
                ...effects(
                  visible,
                  (lineDigits & bit(d) ? lineTargets : 0n) | (boxDigits & bit(d) ? boxTargets : 0n),
                  d
                )
              );
            if (out.length)
              return result(
                "sue-de-coq",
                [...center.cells, ...rowSet.cells, ...boxSet.cells],
                out,
                `宮線交集 ${describe(center)}；線側為 ${describe(rowSet)}，宮側為 ${describe(boxSet)}。交集中的候選不會同時出現在線側和宮側。把交集候選及兩側各自的額外數字計數，共 ${capacity} 種可用位置類別，恰好填滿 ${capacity} 格，所以每類都必須使用。${digits(lineDigits)} 鎖定在這條線的組合內，${digits(boxDigits)} 鎖定在這一宮的組合內，可從各自的其他格刪除。`
              );
          }
      }
    }
  }
  return null;
}

/** Find one bounded, exact named pattern in a complete candidate model.
 * Only currently visible candidates that also exist in that model are effects.
 * @param {number[]} values @param {number[]} masks @param {string} techniqueId
 * @param {number[]} [effectMasks]
 * @returns {import('./proof-verifier.js').Step|null}
 */
export function detectALS(values, masks, techniqueId, effectMasks = masks) {
  if (![values, masks, effectMasks].every((array) => Array.isArray(array) && array.length === 81))
    throw new TypeError("Expected 81 values and candidate masks");
  if (!ALS_TECHNIQUES.includes(techniqueId)) return null;
  const visible = Array(10).fill(0n);
  for (const c of cells)
    if (!values[c])
      for (const d of maskDigits(masks[c] & effectMasks[c])) visible[d] |= cellBits[c];
  if (visible.every((set) => set === 0n)) return null;
  if (techniqueId === "sue-de-coq") return sueDeCoq(values, masks, visible);
  const sets = almostLockedSets(values, masks);
  if (techniqueId === "als-xz") return alsXZ(sets, visible);
  if (techniqueId === "als-xy-wing") return alsXYWing(sets, visible);
  return deathBlossom(values, masks, sets, visible);
}
