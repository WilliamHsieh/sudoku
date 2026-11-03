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
/** @typedef {{observeTitle:string,observe:string[],reasonTitle:string,reasoning:string[],conclusion:string[]}} Teaching */
/** @typedef {{cells:number[],mask:number,cellMask:bigint}} CellSet */
/** @typedef {CellSet & {positions:bigint[],sight:bigint[]}} AlmostLockedSet */
/** @param {string} techniqueId @param {number[]} premiseCells
 * @param {{cell:number,digit:number}[]} eliminations @param {Teaching} teaching */
const result = (techniqueId, premiseCells, eliminations, teaching) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)],
  placements: [],
  eliminations,
  reason: [...teaching.observe, ...teaching.reasoning, ...teaching.conclusion].join("\n\n"),
  teaching,
});

// Teaching helpers describe the already-selected witness; they do not search
// for patterns, change effects, or make assumptions about disjoint ALS cells.
const inBits = (bits) => cells.filter((c) => bits & cellBits[c]);
const positions = (set, d) => inBits(set.positions[d]);
const unique = (cs) => [...new Set(cs)];
function sharedHouse(cs) {
  if (cs.every((c) => rowOf(c) === rowOf(cs[0]))) return `第 ${rowOf(cs[0]) + 1} 橫列`;
  if (cs.every((c) => colOf(c) === colOf(cs[0]))) return `第 ${colOf(cs[0]) + 1} 直行`;
  if (cs.every((c) => boxOf(c) === boxOf(cs[0]))) return `第 ${boxOf(cs[0]) + 1} 宮`;
  return null;
}
function groupFact(set) {
  return set.cells.length === 1
    ? `${labels(set.cells)} 的候選只有 ${digits(set.mask)}，共 ${popcount(set.mask)} 個數。`
    : `${labels(set.cells)} 同在${sharedHouse(set.cells)}。這 ${set.cells.length} 格的候選合起來是 ${digits(set.mask)}，共 ${popcount(set.mask)} 個數。`;
}
function remainingFact(set, removed) {
  const left = digits(set.mask & ~bit(removed));
  return set.cells.length === 1
    ? `${labels(set.cells)} 只剩 ${left}，因此必須填 ${left}。`
    : `${labels(set.cells)} 這 ${set.cells.length} 格便只剩 ${left}，剛好 ${set.cells.length} 種數。它們同在${sharedHouse(set.cells)}，不能重複，所以這些數每個都必須出現。`;
}
function restrictionFact(a, b, d) {
  const spots = unique([...positions(a, d), ...positions(b, d)]);
  return `兩組中的 ${d} 只可能在 ${labels(spots)}。這些格同在${sharedHouse(spots)}，所以兩組不能都使用 ${d}。`;
}

function targetRelations(source, targets) {
  const groups = new Map();
  for (const target of targets) {
    const names = source.map((c) => sharedHouse([target, c]));
    const key = names.join("|");
    if (!groups.has(key)) groups.set(key, { names, targets: [] });
    groups.get(key).targets.push(target);
  }
  return [...groups.values()]
    .map((group) => {
      const byHouse = new Map();
      source.forEach((c, i) => {
        const name = group.names[i];
        if (!byHouse.has(name)) byHouse.set(name, []);
        byHouse.get(name).push(c);
      });
      return (
        `${labels(group.targets)} ` +
        [...byHouse.entries()].map(([name, cs]) => `和 ${labels(cs)} 同在${name}`).join("，")
      );
    })
    .join("；");
}

/** @param {{cell:number,digit:number}[]} out
 * @param {(effect:{cell:number,digit:number})=>number[]} sourceForEffect */
function targetConclusions(out, sourceForEffect) {
  const groups = new Map();
  for (const effect of out) {
    const source = unique(sourceForEffect(effect)).sort((a, b) => a - b);
    const key = `${effect.digit}:${source.join(",")}`;
    if (!groups.has(key)) groups.set(key, { digit: effect.digit, source, targets: [] });
    groups.get(key).targets.push(effect.cell);
  }
  const forced = [],
    conflicts = [];
  for (const { digit, source, targets } of groups.values()) {
    forced.push(
      source.length === 1
        ? `${labels(source)} 必須填 ${digit}`
        : `${labels(source)} 之中至少有一格必須填 ${digit}`
    );
    const house = sharedHouse([...source, ...targets]);
    conflicts.push(
      house
        ? `${labels(targets)} 也在${house}，再填 ${digit} 就會重複`
        : `${targetRelations(source, targets)}；${targets.length === 1 ? "它" : "其中任何一格"}若填 ${digit}，就會讓上述位置全部失去 ${digit}`
    );
  }
  return [`因此，${forced.join("；")}。`, `${conflicts.join("；")}，所以這些候選不能保留。`];
}

function teachXZ(a, b, x, out) {
  return {
    observeTitle: "先找兩組各多一個候選的格子",
    observe: [`第一組：${groupFact(a)}`, `第二組：${groupFact(b)}`, restrictionFact(a, b, x)],
    reasonTitle: `分別考慮第一組有沒有 ${x}`,
    reasoning: [
      `1. 如果第一組 ${labels(a.cells)} 使用 ${x}，第二組的 ${labels(positions(b, x))} 就不能填 ${x}。${remainingFact(b, x)}`,
      `2. 如果第一組 ${labels(a.cells)} 完全沒有使用 ${x}，${remainingFact(a, x)}`,
    ],
    conclusion: targetConclusions(out, ({ digit }) => [
      ...positions(a, digit),
      ...positions(b, digit),
    ]),
  };
}

function teachDoubleXZ(a, b, rcc, out) {
  const [x, y] = maskDigits(rcc);
  return {
    observeTitle: "先看兩組候選，以及兩個不能重複的數",
    observe: [
      `第一組：${groupFact(a)}`,
      `第二組：${groupFact(b)}`,
      restrictionFact(a, b, x),
      restrictionFact(a, b, y),
    ],
    reasonTitle: `${x} 和 ${y} 必須分別由兩組使用`,
    reasoning: [
      `1. 第一組 ${labels(a.cells)} 至少要使用 ${x}、${y} 其中一個。若兩個都不用，` +
        (a.mask & ~rcc
          ? `就只剩 ${digits(a.mask & ~rcc)}，只有 ${a.cells.length - 1} 種數，填不滿 ${a.cells.length} 個不能重複的格子。`
          : "這一格就沒有數字可以填了。"),
      `2. 如果第一組使用 ${x}，第二組就不能用 ${x}。${remainingFact(b, x)}其中 ${y} 必須出現，反過來使第一組不能用 ${y}。${remainingFact(a, y)}`,
      `3. 如果第一組使用 ${y}，第二組就不能用 ${y}。${remainingFact(b, y)}其中 ${x} 必須出現，反過來使第一組不能用 ${x}。${remainingFact(a, x)}`,
    ],
    conclusion: targetConclusions(out, ({ cell, digit }) =>
      rcc & bit(digit)
        ? [...positions(a, digit), ...positions(b, digit)]
        : positions(a.mask & bit(digit) && a.sight[digit] & cellBits[cell] ? a : b, digit)
    ),
  };
}

function teachXYWing(a, pivot, b, x, y, out) {
  const reasoning = [];
  for (const z of unique(out.map((effect) => effect.digit))) {
    reasoning.push(
      `先看 ${z}：如果第一組 ${labels(a.cells)} 已經有 ${z}，就已找到一個 ${z}。接下來考慮第一組完全沒有 ${z} 的另一種情況。`,
      `第一組沒有 ${z} 時，${remainingFact(a, z)}因此 ${x} 必須出現，會使中間組的 ${labels(positions(pivot, x))} 不能填 ${x}。`,
      `中間組沒有 ${x} 時，${remainingFact(pivot, x)}因此 ${y} 必須出現，會使第三組的 ${labels(positions(b, y))} 不能填 ${y}。`,
      `第三組沒有 ${y} 時，${remainingFact(b, y)}這包含了 ${z}。所以第一組若沒有 ${z}，第三組就一定有 ${z}。`
    );
  }
  return {
    observeTitle: "先認出三組候選，以及兩處不能重複的位置",
    observe: [
      `第一組：${groupFact(a)}`,
      `中間組：${groupFact(pivot)}`,
      `第三組：${groupFact(b)}`,
      restrictionFact(a, pivot, x),
      restrictionFact(pivot, b, y),
    ],
    reasonTitle: "第一組若缺少這個數，沿著排除會在第三組找到它",
    reasoning: reasoning.map((text, i) => `${i + 1}. ${text}`),
    conclusion: targetConclusions(out, ({ digit }) => [
      ...positions(a, digit),
      ...positions(b, digit),
    ]),
  };
}

function teachBlossom(stem, stemDigits, chosen, z, out) {
  const distinct = chosen.filter(
    (set, i) => chosen.findIndex((other) => other.cellMask === set.cellMask) === i
  );
  return {
    observeTitle: `從 ${label(stem)} 的每一種可能開始`,
    observe: [
      `${label(stem)} 只有 ${stemDigits.join("、")}，最後一定填其中一個。`,
      ...distinct.map(groupFact),
    ],
    reasonTitle: `${label(stem)} 無論填哪一個數，都會迫使某處出現 ${z}`,
    reasoning: chosen.map((set, i) => {
      const d = stemDigits[i],
        spots = positions(set, d);
      return (
        `${i + 1}. 如果 ${label(stem)} 填 ${d}，${labels(spots)} 與它同在${sharedHouse([stem, ...spots])}，就${spots.length > 1 ? "都" : ""}不能填 ${d}。${remainingFact(set, d)}` +
        (set.cells.length > 1 ? `其中的 ${z} 必須出現在 ${labels(positions(set, z))}。` : "")
      );
    }),
    conclusion: targetConclusions(out, () => chosen.flatMap((set) => positions(set, z))),
  };
}

function teachSueDeCoq(center, rowSet, boxSet, line, box, masks, lineDigits, out) {
  const lineName = sharedHouse(line),
    boxName = `第 ${boxOf(box[0]) + 1} 宮`;
  const rowPart = center.mask & rowSet.mask,
    boxPart = center.mask & boxSet.mask;
  const leftover = center.mask & ~rowSet.mask & ~boxSet.mask;
  const rowCount = popcount(rowSet.mask) - rowSet.cells.length;
  const boxCount = popcount(boxSet.mask) - boxSet.cells.length;
  const limitFact = (set, part, count, house) =>
    `${labels(set.cells)} 這 ${set.cells.length} 格要填 ${set.cells.length} 個不同的數，候選合起來是 ${digits(set.mask)}，共 ${popcount(set.mask)} 種；所以最多只有 ${count} 種候選可以不用。交集也在${house}，不能再用這組已用的數，因此交集從 ${digits(part)} 最多只能選 ${count} 個。`;
  return {
    observeTitle: "先看橫列或直行與九宮格交會的幾格",
    observe: [
      `${labels(center.cells)} 同時在${lineName}和${boxName}。這 ${center.cells.length} 格的候選合起來是 ${digits(center.mask)}。`,
      `${lineName}的另一組：${groupFact(rowSet)}`,
      `${boxName}的另一組：${groupFact(boxSet)}`,
      `交集中的 ${digits(rowPart)} 也出現在前一組，${digits(boxPart)} 也出現在後一組；這兩份數字沒有重疊。` +
        (leftover
          ? `剩下的 ${digits(leftover)} 只出現在交集，不在這兩組裡。`
          : "交集沒有其他候選。"),
    ],
    reasonTitle: "兩邊各留多少可能，交集就必須全部用上",
    reasoning: [
      `1. ${limitFact(rowSet, rowPart, rowCount, lineName)}`,
      `2. ${limitFact(boxSet, boxPart, boxCount, boxName)}`,
      `3. 交集要填滿 ${center.cells.length} 格：從 ${digits(rowPart)} 最多選 ${rowCount} 個，從 ${digits(boxPart)} 最多選 ${boxCount} 個` +
        (leftover ? `，再加上 ${digits(leftover)} 各一個` : "") +
        `，合計剛好 ${center.cells.length} 個。少用任何一份都填不滿，所以這些上限都必須用滿。`,
      `4. ${lineName}裡，${labels(rowSet.cells)} 加上交集選出的 ${rowCount} 格，共 ${popcount(rowSet.mask)} 格只能用 ${digits(rowSet.mask)}；不能重複，所以每個數都必須出現。${boxName}裡，同樣由 ${labels(boxSet.cells)} 加上交集選出的 ${boxCount} 格，把 ${digits(boxSet.mask)} 每個數都用上。` +
        (leftover ? `而 ${digits(leftover)} 必須出現在交集裡。` : ""),
    ],
    conclusion: targetConclusions(out, ({ cell, digit }) => {
      const set = line.includes(cell) && lineDigits & bit(digit) ? rowSet : boxSet;
      return [...center.cells, ...set.cells].filter((c) => masks[c] & bit(digit));
    }),
  };
}

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
          return result("als-xz", [...a.cells, ...b.cells], out, teachXZ(a, b, x, out));
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
        return result("als-xz", [...a.cells, ...b.cells], out, teachDoubleXZ(a, b, rcc, out));
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
                teachXYWing(a, pivot, b, x, y, out)
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
          teachBlossom(stem, stemDigits, chosen, z, out)
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
                teachSueDeCoq(center, rowSet, boxSet, line, box, masks, lineDigits, out)
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
 * @returns {(import('./proof-verifier.js').Step & {teaching:Teaching})|null}
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
