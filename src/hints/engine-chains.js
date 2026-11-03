// Clean-room bounded patterns. Geometry and complete trusted candidate masks are
// inputs; player pencil marks must never be passed as the candidate model.
import { PEERS, bit, maskDigits, popcount, rowOf, colOf, boxOf } from "../game/board.js";

export const CHAIN_TECHNIQUES = Object.freeze([
  "chute-remote-pair",
  "xy-wing",
  "w-wing",
  "simple-colouring",
  "xyz-wing",
]);
const cells = Array.from({ length: 81 }, (_, i) => i);
const units = [rowOf, colOf, boxOf].flatMap((f) =>
  Array.from({ length: 9 }, (_, i) => cells.filter((c) => f(c) === i))
);
const sees = (a, b) => PEERS[a].includes(b);
const label = (c) => `r${rowOf(c) + 1}c${colOf(c) + 1}`;
const labels = (cs) => cs.map(label).join("、");
const result = (techniqueId, premiseCells, eliminations, reason) => ({
  techniqueId,
  premiseCells: [...new Set(premiseCells)],
  placements: [],
  eliminations,
  reason,
});
const effects = (masks, targets, digits) =>
  targets.flatMap((cell) =>
    digits.filter((digit) => masks[cell] & bit(digit)).map((digit) => ({ cell, digit }))
  );

function wings(masks, xyz) {
  const id = xyz ? "xyz-wing" : "xy-wing";
  for (const p of cells) {
    if (popcount(masks[p]) !== (xyz ? 3 : 2)) continue;
    const wings = PEERS[p].filter(
      (c) =>
        popcount(masks[c]) === 2 &&
        (xyz ? (masks[c] & masks[p]) === masks[c] : popcount(masks[c] & masks[p]) === 1)
    );
    for (let i = 0; i < wings.length; i++)
      for (let j = i + 1; j < wings.length; j++) {
        const a = wings[i],
          b = wings[j];
        const common = masks[a] & masks[b];
        if (popcount(common) !== 1 || popcount(masks[a] | masks[b] | masks[p]) !== 3) continue;
        if (xyz ? (masks[a] | masks[b]) !== masks[p] : (common & masks[p]) !== 0) continue;
        const d = maskDigits(common)[0];
        const targets = cells.filter(
          (c) => c !== p && c !== a && c !== b && sees(c, a) && sees(c, b) && (!xyz || sees(c, p))
        );
        const out = effects(masks, targets, [d]);
        if (out.length)
          return result(
            id,
            [p, a, b],
            out,
            xyz
              ? `${label(p)} 只有 ${maskDigits(masks[p]).join("、")}；${label(a)} 只有 ${maskDigits(masks[a]).join("、")}，${label(b)} 只有 ${maskDigits(masks[b]).join("、")}。樞紐若填 ${d}，已確定一個 ${d}；若填另外任一數字，對應翼格必須填 ${d}。所以同時看見這三格的格子不能填 ${d}。`
              : `${label(p)} 只有 ${maskDigits(masks[p]).join("、")}；${label(a)} 只有 ${maskDigits(masks[a]).join("、")}，${label(b)} 只有 ${maskDigits(masks[b]).join("、")}。樞紐的兩種取值各會迫使一個翼格填 ${d}；因此同時看見兩個翼格的格子不能填 ${d}。`
          );
      }
  }
  return null;
}

function wWing(masks) {
  const pairs = cells.filter((c) => popcount(masks[c]) === 2);
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const a = pairs[i],
        b = pairs[j];
      if (masks[a] !== masks[b] || sees(a, b)) continue;
      for (const d of maskDigits(masks[a]))
        for (const unit of units) {
          const link = unit.filter((c) => masks[c] & bit(d));
          if (link.length !== 2 || link.includes(a) || link.includes(b)) continue;
          const [u, v] = link;
          if (!((sees(a, u) && sees(b, v)) || (sees(a, v) && sees(b, u)))) continue;
          const other = maskDigits(masks[a] & ~bit(d))[0];
          const out = effects(
            masks,
            cells.filter((c) => c !== a && c !== b && sees(c, a) && sees(c, b)),
            [other]
          );
          if (out.length)
            return result(
              "w-wing",
              [a, b, u, v],
              out,
              `${labels([a, b])} 都只有 ${maskDigits(masks[a]).join("、")}。同一單位的 ${d} 只在 ${labels(link)}，兩端分別看見這兩個位置。若兩端都填 ${d}，這個單位會無處填 ${d}；所以至少一端填 ${other}，共同可見格不能填 ${other}。`
            );
        }
    }
  return null;
}

// Canonical single/double elimination, not arbitrary remote-pair chains. See definition:
// https://www.sudokuwiki.org/Print_Chute_Remote_Pairs
function chuteRemotePair(values, masks) {
  const pairs = cells.filter((c) => popcount(masks[c]) === 2);
  for (const lineOf of [rowOf, colOf]) {
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++) {
        const a = pairs[i],
          b = pairs[j];
        const la = lineOf(a),
          lb = lineOf(b);
        if (
          masks[a] !== masks[b] ||
          la === lb ||
          Math.floor(la / 3) !== Math.floor(lb / 3) ||
          boxOf(a) === boxOf(b)
        )
          continue;
        const chute = cells.filter((c) => Math.floor(lineOf(c) / 3) === Math.floor(la / 3));
        const bridge = chute.filter((c) => boxOf(c) !== boxOf(a) && boxOf(c) !== boxOf(b));
        const ds = maskDigits(masks[a]);
        const excluded = ds.filter(
          (d) =>
            !bridge.some((c) => values[c] === d) &&
            !bridge.some((c) => lineOf(c) !== la && lineOf(c) !== lb && masks[c] & bit(d)) &&
            bridge.some((c) => lineOf(c) === la && masks[c] & bit(d)) &&
            bridge.some((c) => lineOf(c) === lb && masks[c] & bit(d))
        );
        // If both endpoints were x, the bridge box would have no x. Thus at
        // least one endpoint is y, and a common peer cannot be y.
        const removed = excluded.map((d) => ds.find((other) => other !== d));
        const out = effects(
          masks,
          cells.filter(
            (c) =>
              c !== a &&
              c !== b &&
              ((sees(c, a) && sees(c, b)) ||
                (excluded.length === 2 &&
                  !bridge.includes(c) &&
                  (lineOf(c) === la || lineOf(c) === lb)))
          ),
          removed
        );
        if (out.length)
          return result(
            "chute-remote-pair",
            [a, b, ...bridge],
            out,
            `${labels([a, b])} 都只有 ${ds.join("、")}，位於同一帶的不同線和不同宮。第三宮（${labels(bridge)}）的 ${excluded.join("、")} 只落在兩端所在的線。` +
              excluded
                .map(
                  (d) =>
                    `兩端不能同時填 ${d}，否則第三宮將無處填 ${d}；所以至少一端填 ${ds.find((other) => other !== d)}，共同可見格不能填 ${ds.find((other) => other !== d)}。`
                )
                .join("") +
              (excluded.length === 2
                ? "兩端必定一人一數。此外，兩端所在的線在第三宮以外，其他格也不能填這兩數：對任何一數，若本端不是它，另一端就是它，第三宮便必須在本端這一線填它。"
                : "")
          );
      }
  }
  return null;
}

function colouring(masks) {
  for (let d = 1; d <= 9; d++) {
    const adjacency = Array.from({ length: 81 }, () => new Set());
    for (const unit of units) {
      const link = unit.filter((c) => masks[c] & bit(d));
      if (link.length === 2) {
        adjacency[link[0]].add(link[1]);
        adjacency[link[1]].add(link[0]);
      }
    }
    const visited = new Set();
    for (const start of cells) {
      if (!adjacency[start].size || visited.has(start)) continue;
      const color = new Map([[start, 0]]),
        queue = [start];
      visited.add(start);
      let invalid = false;
      for (let k = 0; k < queue.length; k++) {
        const c = queue[k];
        for (const n of adjacency[c]) {
          if (color.has(n)) {
            if (color.get(n) === color.get(c)) invalid = true;
          } else {
            color.set(n, 1 - color.get(c));
            queue.push(n);
            visited.add(n);
          }
        }
      }
      if (invalid) continue; // Inconsistent input is never a usable proof.
      const groups = [
        queue.filter((c) => color.get(c) === 0),
        queue.filter((c) => color.get(c) === 1),
      ];
      const conflicts = groups.map((g) => g.some((c, i) => g.slice(i + 1).some((n) => sees(c, n))));
      if (conflicts[0] && conflicts[1]) continue;
      const links = queue
        .flatMap((c) =>
          [...adjacency[c]].filter((n) => c < n).map((n) => `${label(c)}↔${label(n)}`)
        )
        .join("、");
      for (let shade = 0; shade < 2; shade++)
        if (conflicts[shade]) {
          return result(
            "simple-colouring",
            queue,
            effects(masks, groups[shade], [d]),
            `數字 ${d} 的強連結（各單位只剩兩個位置）為 ${links}。沿連結交替標色，同色的 ${labels(groups[shade])} 中有兩格互相可見，不能同時為真，因此這一色的所有候選 ${d} 都可刪除。`
          );
        }
      const targets = cells.filter(
        (c) => !color.has(c) && groups.every((g) => g.some((n) => sees(c, n)))
      );
      const out = effects(masks, targets, [d]);
      if (out.length)
        return result(
          "simple-colouring",
          queue,
          out,
          `數字 ${d} 的強連結（各單位只剩兩個位置）為 ${links}。兩色分別是 ${labels(groups[0])} 和 ${labels(groups[1])}，其中一色必為真。每個目標都同時看見兩色，因此不能填 ${d}。`
        );
    }
  }
  return null;
}

/** Find one exact pattern. Inputs must contain complete trusted candidates. */
export function detectChain(values, masks, techniqueId) {
  if (
    !Array.isArray(values) ||
    values.length !== 81 ||
    !Array.isArray(masks) ||
    masks.length !== 81
  )
    throw new TypeError("Expected 81 values and candidate masks");
  switch (techniqueId) {
    case "xy-wing":
      return wings(masks, false);
    case "xyz-wing":
      return wings(masks, true);
    case "w-wing":
      return wWing(masks);
    case "chute-remote-pair":
      return chuteRemotePair(values, masks);
    case "simple-colouring":
      return colouring(masks);
    default:
      return null;
  }
}
