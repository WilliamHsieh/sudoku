// Clean-room, bounded named patterns, relative to the complete candidate model.
// No uniqueness assumptions and no solution search. The verifier is independent.
// X-Cycles: continuous loops and weak-link discontinuities, at most 10 nodes
// for continuous loops and 9 for discontinuities (including the target). Grouped nodes
// are the 2-3 candidates in a line/box intersection; every group link is checked
// against ALL members. Strong-discontinuity placements are not implemented.
// XY-Chain: 4-8 distinct bivalue cells. AIC: 6-12 distinct candidate nodes,
// strong endpoints, including both a bivalue-cell and a conjugate-house link.
// 3D Medusa: bipartite strong-link components of at most 80 candidate nodes,
// containing both link kinds; colour contradictions and two-colour traps
// (rules 1-5). Cell-emptied-by-colour rule 6 is not implemented.
// Each alternating/XY search examines at most 40,000 extensions per call;
// exhausting a bound returns no hint, never an unproved deduction.
import { PEERS, bit, maskDigits, popcount, rowOf, colOf, boxOf } from "../game/board.js";

export const CHAIN_TECHNIQUES = Object.freeze([
  "x-cycles",
  "xy-chain",
  "3d-medusa",
  "grouped-x-cycles",
  "aic",
]);

const cells = Array.from({ length: 81 }, (_, i) => i);
const units = [rowOf, colOf, boxOf].flatMap((f) =>
  Array.from({ length: 9 }, (_, i) => cells.filter((c) => f(c) === i))
);
const sees = (a, b) => PEERS[a].includes(b);
const label = (c) => `r${rowOf(c) + 1}c${colOf(c) + 1}`;
const candidateLabel = (n) =>
  `${n.cells.length > 1 ? `{${n.cells.map(label).join("、")}}` : label(n.cells[0])}(${n.digit})`;
const result = (techniqueId, premiseCells, eliminations, reason) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)],
  placements: [],
  eliminations,
  reason,
});
const MAX_EXTENSIONS = 40000;

/** A group means at least one member contains its digit. */
const incompatible = (a, b) =>
  a.digit === b.digit
    ? a.cells.every((c) => b.cells.every((other) => sees(c, other)))
    : a.cells.length === 1 && b.cells.length === 1 && a.cells[0] === b.cells[0];

function graph(nodes, strongPairs) {
  const strong = nodes.map(() => new Set());
  const weak = nodes.map(() => []);
  for (const [a, b] of strongPairs) {
    strong[a].add(b);
    strong[b].add(a);
  }
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++)
      if (incompatible(nodes[a], nodes[b])) {
        weak[a].push(b);
        weak[b].push(a);
      }
  return { nodes, strong: strong.map((set) => [...set]), weak };
}

function candidateGraph(values, masks) {
  const nodes = cells.flatMap((cell) =>
    maskDigits(masks[cell]).map((digit) => ({ cells: [cell], digit }))
  );
  const lookup = new Map(nodes.map((node, index) => [node.cells[0] * 10 + node.digit, index]));
  const pairs = [];
  for (const cell of cells) {
    const ds = maskDigits(masks[cell]);
    if (ds.length === 2) pairs.push(ds.map((digit) => lookup.get(cell * 10 + digit)));
  }
  for (const unit of units)
    for (let digit = 1; digit <= 9; digit++) {
      if (unit.some((cell) => values[cell] === digit)) continue;
      const positions = unit.filter((cell) => masks[cell] & bit(digit));
      if (positions.length === 2)
        pairs.push(positions.map((cell) => lookup.get(cell * 10 + digit)));
    }
  return graph(nodes, pairs);
}

function digitGraph(values, masks, digit, grouped) {
  const positions = cells.filter((cell) => masks[cell] & bit(digit));
  const groups = positions.map((cell) => [cell]);
  if (grouped) {
    const seen = new Set();
    for (const lineOf of [rowOf, colOf])
      for (let line = 0; line < 9; line++)
        for (let box = 0; box < 9; box++) {
          const group = positions.filter((cell) => lineOf(cell) === line && boxOf(cell) === box);
          const key = group.join(",");
          if (group.length >= 2 && !seen.has(key)) {
            seen.add(key);
            groups.push(group);
          }
        }
  }
  const nodes = groups.map((group) => ({ cells: group, digit }));
  const pairs = [];
  for (const unit of units) {
    if (unit.some((cell) => values[cell] === digit)) continue;
    const positions = unit.filter((cell) => masks[cell] & bit(digit));
    if (positions.length < 2) continue;
    const subsets = nodes.flatMap((node, i) =>
      node.cells.every((c) => unit.includes(c)) ? [i] : []
    );
    for (let a = 0; a < subsets.length; a++)
      for (let b = a + 1; b < subsets.length; b++) {
        const left = subsets[a],
          right = subsets[b];
        if (nodes[left].cells.length + nodes[right].cells.length !== positions.length) continue;
        if (nodes[left].cells.some((c) => nodes[right].cells.includes(c))) continue;
        // Both nodes partition every possible location in this house.
        pairs.push([left, right]);
      }
  }
  return graph(nodes, pairs);
}

const pathText = (nodes, path) =>
  path.map((id, i) => `${i ? (i % 2 ? " ＝ " : " － ") : ""}${candidateLabel(nodes[id])}`).join("");
const linkLegend = "＝是強連結（至少一端為真），－是弱連結（不能同時為真）。";

/** Enumerate distinct-node S-W-...-S chains, short ones first. */
function alternating(graph, maxNodes, minimum, budget, inspect, disjointCells = false) {
  const { nodes, strong, weak } = graph;
  const used = new Set();
  const path = [];
  function visit(limit) {
    if (path.length === limit) return inspect(path);
    const current = path[path.length - 1];
    const links = path.length % 2 ? strong[current] : weak[current];
    for (const next of links) {
      if (++budget.count > MAX_EXTENSIONS) return null;
      if (used.has(next) || (!strong[next].length && path.length + 1 < limit)) continue;
      if (
        disjointCells &&
        path.some((id) => nodes[id].cells.some((c) => nodes[next].cells.includes(c)))
      )
        continue;
      used.add(next);
      path.push(next);
      const found = visit(limit);
      path.pop();
      used.delete(next);
      if (found) return found;
    }
    return null;
  }
  for (let limit = minimum; limit <= maxNodes; limit += 2)
    for (let start = 0; start < nodes.length; start++) {
      if (!strong[start].length) continue;
      if (budget.count >= MAX_EXTENSIONS) return null;
      path.push(start);
      used.add(start);
      const found = visit(limit);
      path.pop();
      used.delete(start);
      if (found) return found;
    }
  return null;
}

function xCycles(values, masks, effectMasks, grouped) {
  const id = grouped ? "grouped-x-cycles" : "x-cycles";
  const budget = { count: 0 };
  for (let digit = 1; digit <= 9; digit++) {
    if (!effectMasks.some((mask) => mask & bit(digit))) continue;
    const g = digitGraph(values, masks, digit, grouped);
    const found = alternating(
      g,
      10,
      4,
      budget,
      (path) => {
        if (grouped && !path.some((index) => g.nodes[index].cells.length > 1)) return null;
        const first = g.nodes[path[0]],
          last = g.nodes[path[path.length - 1]];
        const premises = path.flatMap((index) => g.nodes[index].cells);
        const targets = cells.filter(
          (cell) =>
            effectMasks[cell] & bit(digit) &&
            !premises.includes(cell) &&
            incompatible({ cells: [cell], digit }, first) &&
            incompatible({ cells: [cell], digit }, last)
        );
        if (!targets.length) return null;
        const continuous = incompatible(first, last);
        if (!continuous && path.length > 8) return null;
        const groupText = grouped
          ? "大括號是一組同宮同列或同行的候選；組為真表示其中一格填入該數。組間的弱連結要求每一格都互相可見，強連結則完整分割某單位的全部位置。"
          : "";
        return result(
          id,
          premises,
          targets.map((cell) => ({ cell, digit })),
          `${groupText}${linkLegend}數字 ${digit} 的鏈為 ${pathText(g.nodes, path)}。` +
            (continuous
              ? "兩端之間也有弱連結，形成交替閉環。"
              : "每個目標分別以弱連結接到兩端，形成在目標處有兩條弱連結的閉環。") +
            `若目標填 ${digit}，兩端都不能是 ${digit}；但沿鏈從第一端為假出發，強弱交替會迫使最後一端為真，矛盾。因此 ${targets.map(label).join("、")} 可刪除 ${digit}。`
        );
      },
      true
    );
    if (found) return found;
  }
  return null;
}

function xyChain(masks, effectMasks) {
  const pairs = cells.filter((cell) => popcount(masks[cell]) === 2);
  let extensions = 0;
  for (let limit = 4; limit <= 8; limit++)
    for (const start of pairs)
      for (const digit of maskDigits(masks[start])) {
        const path = [start];
        const shared = [];
        function visit(current, outgoing) {
          for (const next of PEERS[current]) {
            if (++extensions > MAX_EXTENSIONS) return null;
            if (
              popcount(masks[next]) !== 2 ||
              !(masks[next] & bit(outgoing)) ||
              path.includes(next)
            )
              continue;
            const other = maskDigits(masks[next] & ~bit(outgoing))[0];
            path.push(next);
            shared.push(outgoing);
            if (path.length === limit && other === digit) {
              const targets = cells.filter(
                (cell) =>
                  effectMasks[cell] & bit(digit) &&
                  !path.includes(cell) &&
                  sees(cell, start) &&
                  sees(cell, next)
              );
              if (targets.length)
                return result(
                  "xy-chain",
                  path,
                  targets.map((cell) => ({ cell, digit })),
                  `雙候選鏈：${path.map((cell) => `${label(cell)}{${maskDigits(masks[cell]).join("、")}}`).join(" → ")}。相鄰格互相可見，依序共用 ${shared.join("、")}；每格都只有列出的兩個候選。若第一格不是 ${digit}，沿鏈逐格排除共同候選，最後一格必為 ${digit}。所以兩端至少一格填 ${digit}，同時看見兩端的 ${targets.map(label).join("、")} 可刪除 ${digit}。`
                );
            }
            if (path.length < limit) {
              const found = visit(next, other);
              if (found) return found;
            }
            path.pop();
            shared.pop();
          }
          return null;
        }
        const other = maskDigits(masks[start] & ~bit(digit))[0];
        const found = visit(start, other);
        if (found) return found;
        if (extensions >= MAX_EXTENSIONS) return null;
      }
  return null;
}

function mixedLinks(nodes, path) {
  let cellLink = false,
    houseLink = false;
  for (let i = 0; i < path.length - 1; i += 2) {
    if (nodes[path[i]].digit !== nodes[path[i + 1]].digit) cellLink = true;
    else houseLink = true;
  }
  return cellLink && houseLink;
}

function aic(values, masks, effectMasks) {
  const g = candidateGraph(values, masks);
  const targets = g.nodes.flatMap((node, index) =>
    effectMasks[node.cells[0]] & bit(node.digit) ? [index] : []
  );
  return alternating(g, 12, 6, { count: 0 }, (path) => {
    if (!mixedLinks(g.nodes, path)) return null;
    const first = g.nodes[path[0]],
      last = g.nodes[path[path.length - 1]];
    const eliminated = targets.filter(
      (index) =>
        !path.includes(index) &&
        incompatible(g.nodes[index], first) &&
        incompatible(g.nodes[index], last)
    );
    if (!eliminated.length) return null;
    return result(
      "aic",
      path.flatMap((index) => g.nodes[index].cells),
      eliminated.map((index) => ({ cell: g.nodes[index].cells[0], digit: g.nodes[index].digit })),
      `${linkLegend}交替推理鏈為 ${pathText(g.nodes, path)}。強連結來自單位中該數只剩兩個位置，或一格只剩兩個候選。假設第一端為假，沿鏈強弱交替，最後一端必為真；所以兩端至少一端為真。${eliminated.map((index) => candidateLabel(g.nodes[index])).join("、")} 都與兩端衝突（同格不同數，或同數互相可見），因此可刪除。`
    );
  });
}

function medusa(values, masks, effectMasks) {
  const g = candidateGraph(values, masks);
  const visited = new Set();
  for (let start = 0; start < g.nodes.length; start++) {
    if (visited.has(start) || !g.strong[start].length) continue;
    const colors = new Map([[start, 0]]),
      queue = [start];
    visited.add(start);
    let inconsistent = false,
      cellLink = false,
      houseLink = false;
    for (let k = 0; k < queue.length; k++) {
      const current = queue[k];
      for (const next of g.strong[current]) {
        if (g.nodes[current].digit === g.nodes[next].digit) houseLink = true;
        else cellLink = true;
        if (colors.has(next)) {
          if (colors.get(next) === colors.get(current)) inconsistent = true;
        } else {
          colors.set(next, 1 - colors.get(current));
          queue.push(next);
          visited.add(next);
        }
      }
    }
    if (inconsistent || queue.length > 80 || !cellLink || !houseLink) continue;
    const shades = [
      queue.filter((index) => colors.get(index) === 0),
      queue.filter((index) => colors.get(index) === 1),
    ];
    const conflicts = shades.map((shade) =>
      shade.flatMap((index, i) =>
        shade
          .slice(i + 1)
          .filter((other) => incompatible(g.nodes[index], g.nodes[other]))
          .map((other) => [index, other])
      )
    );
    if (conflicts.every((group) => group.length)) continue;
    const intro = `將各單位只剩兩處的同數候選，以及雙候選格中的兩數，以強連結連起並交替著色。甲色：${shades[0].map((index) => candidateLabel(g.nodes[index])).join("、")}；乙色：${shades[1].map((index) => candidateLabel(g.nodes[index])).join("、")}。同一連通組中，必有一色全部為真、另一色全部為假。`;
    for (let shade = 0; shade < 2; shade++) {
      if (!conflicts[shade].length) continue;
      const out = shades[shade]
        .filter((index) => effectMasks[g.nodes[index].cells[0]] & bit(g.nodes[index].digit))
        .map((index) => ({ cell: g.nodes[index].cells[0], digit: g.nodes[index].digit }));
      if (!out.length) continue;
      const witness = conflicts[shade][0];
      return result(
        "3d-medusa",
        queue.flatMap((index) => g.nodes[index].cells),
        out,
        `${intro}${shade ? "乙" : "甲"}色的 ${witness.map((index) => candidateLabel(g.nodes[index])).join(" 與 ")} 互相衝突（同格不同數，或同數互相可見），不能同時為真。因此這一色的候選全部可刪除。`
      );
    }
    const targets = g.nodes.flatMap((node, index) =>
      !colors.has(index) &&
      effectMasks[node.cells[0]] & bit(node.digit) &&
      shades.every((shade) => shade.some((other) => incompatible(node, g.nodes[other])))
        ? [index]
        : []
    );
    if (targets.length)
      return result(
        "3d-medusa",
        queue.flatMap((index) => g.nodes[index].cells),
        targets.map((index) => ({ cell: g.nodes[index].cells[0], digit: g.nodes[index].digit })),
        `${intro}${targets.map((index) => candidateLabel(g.nodes[index])).join("、")} 各自與甲、乙兩色都至少有一個候選衝突（同格不同數，或同數互相可見）。無論哪一色為真，這些候選都不能成立，因此可刪除。`
      );
  }
  return null;
}

/** Find one supported bounded pattern; effectMasks never establish a link.
 * @param {number[]} values @param {number[]} masks @param {string} techniqueId
 * @param {number[]} [effectMasks] candidates currently visible to the player
 */
export function detectAdvancedChain(values, masks, techniqueId, effectMasks = masks) {
  if (
    !Array.isArray(values) ||
    values.length !== 81 ||
    !Array.isArray(masks) ||
    masks.length !== 81 ||
    !Array.isArray(effectMasks) ||
    effectMasks.length !== 81
  )
    throw new TypeError("Expected 81 values and candidate masks");
  masks = masks.map((mask, cell) => (values[cell] ? 0 : mask));
  effectMasks = masks.map((mask, cell) => mask & effectMasks[cell]);
  if (!effectMasks.some(Boolean)) return null;
  switch (techniqueId) {
    case "x-cycles":
      return xCycles(values, masks, effectMasks, false);
    case "grouped-x-cycles":
      return xCycles(values, masks, effectMasks, true);
    case "xy-chain":
      return xyChain(masks, effectMasks);
    case "3d-medusa":
      return medusa(values, masks, effectMasks);
    case "aic":
      return aic(values, masks, effectMasks);
    default:
      return null;
  }
}
