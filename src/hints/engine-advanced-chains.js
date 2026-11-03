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
const nodeYes = (node) =>
  node.cells.length === 1
    ? `${label(node.cells[0])} 填 ${node.digit}`
    : `${node.cells.map(label).join("、")} 之中有一格填 ${node.digit}`;
const nodeNo = (node) =>
  node.cells.length === 1
    ? `${label(node.cells[0])} 不填 ${node.digit}`
    : `${node.cells.map(label).join("、")} 都不填 ${node.digit}`;
const nodeMust = (node) =>
  node.cells.length === 1
    ? `${label(node.cells[0])} 必須填 ${node.digit}`
    : `${node.cells.map(label).join("、")} 之中必須有一格填 ${node.digit}`;
const nodeCannot = (node) =>
  node.cells.length === 1
    ? `${label(node.cells[0])} 不能填 ${node.digit}`
    : `${node.cells.map(label).join("、")} 都不能填 ${node.digit}`;
const unitName = (index) =>
  index < 9 ? `第 ${index + 1} 橫列` : index < 18 ? `第 ${index - 8} 直行` : `第 ${index - 17} 宮`;

// These explanations recover the exact witness from the already chosen proof.
// No guessed house, extra assumption, or change to the detector search is used.
function twoChoiceFact(a, b, masks) {
  if (a.digit !== b.digit) return `${label(a.cells[0])} 只剩 ${a.digit}、${b.digit} 兩個候選`;
  const positions = [...a.cells, ...b.cells];
  const house = units.findIndex((unit) => {
    const remaining = unit.filter((cell) => masks[cell] & bit(a.digit));
    return (
      remaining.length === positions.length && positions.every((cell) => remaining.includes(cell))
    );
  });
  if (house < 0) throw new Error("Missing exact house for chain explanation");
  return `${unitName(house)}的 ${a.digit} 只可能在 ${positions.map(label).join("、")}`;
}

function conflictFact(a, b) {
  if (a.digit !== b.digit) return `${label(a.cells[0])} 一格不能同時填 ${a.digit} 和 ${b.digit}`;
  const positions = [...new Set([...a.cells, ...b.cells])];
  const house = units.findIndex((unit) => positions.every((cell) => unit.includes(cell)));
  if (house >= 0)
    return `${positions.map(label).join("、")} 同在${unitName(house)}，${a.digit} 只能出現一次`;
  // Group links can use different houses for different member pairs. List the
  // actual pairs rather than inventing a single shared house for the whole group.
  return (
    a.cells
      .flatMap((left) =>
        b.cells.map((right) => {
          const shared = units.findIndex((unit) => unit.includes(left) && unit.includes(right));
          if (shared < 0) throw new Error("Missing conflict witness for chain explanation");
          return `${label(left)} 與 ${label(right)} 同在${unitName(shared)}`;
        })
      )
      .join("；") + `，各處都不能重複填 ${a.digit}`
  );
}

const numbered = (paragraphs) => paragraphs.map((paragraph, i) => `${i + 1}. ${paragraph}`);
const teaching = (observeTitle, observe, reasonTitle, reasoning, conclusion) => ({
  observeTitle,
  observe,
  reasonTitle,
  reasoning: numbered(reasoning),
  conclusion,
});
const result = (techniqueId, premiseCells, eliminations, explanation) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)],
  placements: [],
  eliminations,
  reason: [...explanation.observe, ...explanation.reasoning, ...explanation.conclusion].join(
    "\n\n"
  ),
  teaching: explanation,
});

function transition(a, b, aIsFilled, masks, reversible = false) {
  if (!aIsFilled)
    return `因為 ${nodeNo(a)}，而${twoChoiceFact(a, b, masks)}，所以 ${nodeMust(b)}。`;
  return reversible
    ? `${twoChoiceFact(a, b, masks)}，兩者只能選一個。這裡 ${nodeYes(a)}，所以 ${nodeCannot(b)}。`
    : `因為 ${nodeYes(a)}，而${conflictFact(a, b)}，所以 ${nodeCannot(b)}。`;
}

function endpointConclusions(first, last, targets, reasoning) {
  const explanations = targets.map(
    (target) =>
      `若 ${nodeYes(target)}，就會排除「${nodeYes(first)}」（${conflictFact(target, first)}），也會排除「${nodeYes(last)}」（${conflictFact(target, last)}）。`
  );
  // Keep multiple actual target witnesses readable, one paragraph per target.
  if (targets.length > 1) reasoning.push(...explanations);
  return [
    targets.length === 1
      ? explanations[0]
      : `上面逐一檢查的目標 ${[...new Set(targets.flatMap((target) => target.cells))].map(label).join("、")}，各自都會把這兩個端點的選擇同時排除。`,
    `但「${nodeYes(first)}」與「${nodeYes(last)}」至少會發生一個，因此目標不能同時把它們排除。`,
  ];
}

function chainTeaching(nodes, path, masks, targets, grouped = false) {
  const first = nodes[path[0]],
    last = nodes[path[path.length - 1]];
  const facts = [];
  for (let i = 0; i < path.length - 1; i += 2)
    facts.push(twoChoiceFact(nodes[path[i]], nodes[path[i + 1]], masks) + "。");
  if (grouped) {
    const group = nodes[path.find((index) => nodes[index].cells.length > 1)];
    facts.unshift(
      `先把 ${group.cells.map(label).join("、")} 看成一組可能的位置：說「這組有 ${group.digit}」，只表示其中一格填 ${group.digit}，不是每一格都填。`
    );
  }
  const reasoning = [`先假設 ${nodeNo(first)}，看看後面的格子會被迫怎麼填。`];
  for (let i = 0; i < path.length - 1; i++)
    reasoning.push(transition(nodes[path[i]], nodes[path[i + 1]], i % 2 === 1, masks));
  reasoning.push(
    `如果 ${nodeNo(first)}，剛才就一路推到 ${nodeYes(last)}；另一種情況則是 ${nodeYes(first)}。因此「${nodeYes(first)}」和「${nodeYes(last)}」至少會發生一個。`
  );
  return teaching(
    grouped ? "先找這個數字能落在哪幾格" : "先找只剩兩個選擇的位置",
    facts.slice(0, 5),
    "先假設起點不填，再一步一步往下推",
    reasoning,
    endpointConclusions(first, last, targets, reasoning)
  );
}

function xyTeaching(path, shared, masks, digit, targets) {
  const facts = [];
  for (let i = 0; i < path.length; i += 2)
    facts.push(
      path
        .slice(i, i + 2)
        .map((cell) => `${label(cell)} 只剩 ${maskDigits(masks[cell]).join("、")}`)
        .join("；") + "。"
    );
  const first = { cells: [path[0]], digit },
    last = { cells: [path[path.length - 1]], digit };
  facts.push(
    `先留意兩端 ${label(path[0])}、${label(path[path.length - 1])}：它們都還有候選 ${digit}。`
  );
  const reasoning = [
    `先假設 ${nodeNo(first)}。${label(path[0])} 只有兩個候選，所以只能填 ${shared[0]}。`,
  ];
  for (let i = 1; i < path.length; i++) {
    const from = { cells: [path[i - 1]], digit: shared[i - 1] };
    const to = { cells: [path[i]], digit: shared[i - 1] };
    const other = maskDigits(masks[path[i]] & ~bit(to.digit))[0];
    reasoning.push(
      `${nodeYes(from)}；${conflictFact(from, to)}，所以 ${label(path[i])} 不能填 ${to.digit}。它只剩 ${to.digit}、${other}，因此必須填 ${other}。`
    );
  }
  reasoning.push(
    `若 ${nodeNo(first)}，${nodeMust(last)}；若 ${nodeYes(first)}，第一端本來就有 ${digit}。所以 ${label(path[0])}、${label(path[path.length - 1])} 至少一格填 ${digit}。`
  );
  return teaching(
    "先找每格都只剩兩個候選的接力路線",
    facts,
    "假設第一格不填，再追到最後一格",
    reasoning,
    endpointConclusions(
      first,
      last,
      targets.map((cell) => ({ cells: [cell], digit })),
      reasoning
    )
  );
}

// Keep only paths needed to explain the actual conflict and actual effects.
// This traversal is presentation-only; it never selects or alters an effect.
function explanationTree(g, root, destinations) {
  const parent = new Map([[root, -1]]),
    depth = new Map([[root, 0]]),
    queue = [root];
  for (let i = 0; i < queue.length; i++)
    for (const next of g.strong[queue[i]])
      if (!parent.has(next)) {
        parent.set(next, queue[i]);
        depth.set(next, depth.get(queue[i]) + 1);
        queue.push(next);
      }
  const needed = new Set([root]);
  for (let node of destinations)
    while (node !== root && !needed.has(node)) {
      needed.add(node);
      node = parent.get(node);
    }
  return {
    edges: queue
      .filter((node) => node !== root && needed.has(node))
      .map((node) => [parent.get(node), node]),
    depth,
  };
}

function medusaTeaching(g, masks, root, destinations, conflict, targetWitnesses, eliminated) {
  const start = g.nodes[root];
  const { edges, depth } = explanationTree(g, root, destinations);
  const facts = [
    ...new Set(edges.map(([a, b]) => twoChoiceFact(g.nodes[a], g.nodes[b], masks) + "。")),
  ];
  const observe = [
    `先從 ${label(start.cells[0])} 的候選 ${start.digit} 開始，檢查下面這些只能二選一的位置。`,
    ...facts.slice(0, 4),
  ];
  const reasoning = [
    `先試第一種情況：假設 ${nodeYes(start)}。下面每一步都只用同格的兩個候選，或某個數字在同一橫列、直行、宮中僅剩的兩個位置。`,
  ];
  for (const [from, to] of edges)
    reasoning.push(transition(g.nodes[from], g.nodes[to], depth.get(from) % 2 === 0, masks, true));
  if (conflict) {
    const [a, b] = conflict.map((index) => g.nodes[index]);
    reasoning.push(
      `這樣會同時要求 ${nodeYes(a)}，以及 ${nodeYes(b)}。可是${conflictFact(a, b)}，兩個要求不能一起滿足，所以起點 ${label(start.cells[0])} 不能填 ${start.digit}。`
    );
    reasoning.push(
      `既然 ${nodeCannot(start)}，沿路的選擇就要重新檢查。每一步都必須在兩個選擇中選一個，因此沿相同關係往下推，前面各步的「填入」和「不填」都要對調。`
    );
    for (let i = 0; i < eliminated.length; i += 4)
      reasoning.push(
        `沿這些兩選一關係反推：${eliminated
          .slice(i, i + 4)
          .map((index) => nodeCannot(g.nodes[index]))
          .join("；")}。`
      );

    return teaching(
      "先找能一路帶動其他格的兩個選擇",
      observe,
      "試填起點，找出具體的矛盾",
      reasoning,
      [
        `矛盾發生在 ${a.cells.map(label).join("、")} 和 ${b.cells.map(label).join("、")}，因此不能採用「${nodeYes(start)}」這個起點。`,
        `這次的目標都已在上面的步驟連回 ${label(start.cells[0])}；起點不能填 ${start.digit}，沿兩選一關係反推，它們也不能保留。`,
      ]
    );
  }
  const otherCase = [...new Set(targetWitnesses.map((witness) => witness[1]))];
  reasoning.push(
    `再看另一種情況：如果 ${nodeNo(start)}，每一步仍只有兩個選擇，前面各步的「填入」和「不填」就全部對調。因此這時 ${otherCase.map((index) => nodeMust(g.nodes[index])).join("、")}。`
  );
  const links = targetWitnesses.map(([a, b, target]) => {
    const n = g.nodes[target];
    return `「${nodeYes(n)}」會和第一種情況要求的「${nodeYes(g.nodes[a])}」衝突（${conflictFact(n, g.nodes[a])}），也和另一種情況要求的「${nodeYes(g.nodes[b])}」衝突（${conflictFact(n, g.nodes[b])}）`;
  });
  if (links.length > 1) reasoning.push(...links.map((text) => text + "。"));
  return teaching(
    "先找能一路帶動其他格的兩個選擇",
    observe,
    "把起點的兩種可能分開檢查",
    reasoning,
    [
      links.length === 1
        ? links[0] + "。"
        : `上面逐一檢查的目標 ${[...new Set(targetWitnesses.map(([, , target]) => g.nodes[target].cells[0]))].map(label).join("、")}，不論 ${label(start.cells[0])} 選哪一種填法，都會和該情況的必然結果衝突。`,
      `不論 ${label(start.cells[0])} 最後填不填 ${start.digit}，這些目標候選都會和其中一種必然的結果衝突。`,
    ]
  );
}

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
        return result(
          id,
          premises,
          targets.map((cell) => ({ cell, digit })),
          chainTeaching(
            g.nodes,
            path,
            masks,
            targets.map((cell) => ({ cells: [cell], digit })),
            grouped
          )
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
                  xyTeaching(path, shared, masks, digit, targets)
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
      chainTeaching(
        g.nodes,
        path,
        masks,
        eliminated.map((index) => g.nodes[index])
      )
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
        medusaTeaching(
          g,
          masks,
          witness[0],
          [
            ...witness,
            ...shades[shade].filter((index) =>
              out.some(
                (effect) =>
                  effect.cell === g.nodes[index].cells[0] && effect.digit === g.nodes[index].digit
              )
            ),
          ],
          witness,
          [],
          shades[shade].filter((index) =>
            out.some(
              (effect) =>
                effect.cell === g.nodes[index].cells[0] && effect.digit === g.nodes[index].digit
            )
          )
        )
      );
    }
    const targets = g.nodes.flatMap((node, index) =>
      !colors.has(index) &&
      effectMasks[node.cells[0]] & bit(node.digit) &&
      shades.every((shade) => shade.some((other) => incompatible(node, g.nodes[other])))
        ? [index]
        : []
    );
    if (targets.length) {
      const witnesses = targets.map((index) => [
        shades[0].find((other) => incompatible(g.nodes[index], g.nodes[other])),
        shades[1].find((other) => incompatible(g.nodes[index], g.nodes[other])),
        index,
      ]);
      return result(
        "3d-medusa",
        queue.flatMap((index) => g.nodes[index].cells),
        targets.map((index) => ({ cell: g.nodes[index].cells[0], digit: g.nodes[index].digit })),
        medusaTeaching(
          g,
          masks,
          witnesses[0][0],
          witnesses.flatMap(([a, b]) => [a, b]),
          null,
          witnesses,
          []
        )
      );
    }
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
