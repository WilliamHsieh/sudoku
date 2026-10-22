// A stroke owns an immutable baseline and a draft. History sees only the result.
import { hasCandidate, isEditable, valueAt, toggleCandidate } from "./game.js";
import { changedCells } from "./history.js";

/** @param {import('./game.js').GameState} before @param {number} d */
export function createStroke(before, d) {
  return {
    before,
    state: before,
    d,
    brush: /** @type {'add' | 'remove' | null} */ (null),
    touched: new Set(),
    refused: new Set(),
    visited: new Set(),
    rejected: false,
    blockers: /** @type {number[]} */ ([]),
  };
}

/** Set a crossed cell to the fixed brush state. @param {ReturnType<typeof createStroke>} s @param {number} i */
export function paintCell(s, i) {
  if (s.rejected || s.visited.has(i)) return;
  s.visited.add(i);
  if (!isEditable(s.state, i) || valueAt(s.state, i)) return;
  const present = hasCandidate(s.state, i, s.d);
  const first = s.brush === null;
  s.brush ??= present ? "remove" : "add";
  if (present !== (s.brush === "add")) {
    const result = toggleCandidate(s.state, i, s.d);
    if (result.blockers.length) {
      s.refused.add(i);
      if (first) {
        s.brush = null;
        s.rejected = true;
        s.blockers = result.blockers;
      }
      return;
    }
    s.state = result.state;
  }
  s.touched.add(i);
}

/** Net marks always compare with the stroke baseline. @param {ReturnType<typeof createStroke>} s */
export function strokeMarks(s) {
  const add = new Set();
  const rem = new Set();
  for (const i of s.touched) {
    const before = hasCandidate(s.before, i, s.d);
    const after = hasCandidate(s.state, i, s.d);
    if (before !== after) (after ? add : rem).add(i);
  }
  return {
    d: s.d,
    add,
    rem,
    tint: new Set(s.touched),
    brush: s.brush,
    phase: /** @type {'live' | 'hold' | 'fade'} */ ("live"),
  };
}

/** Return the baseline by identity for a net no-op. @param {ReturnType<typeof createStroke>} s */
export function strokeResult(s) {
  return changedCells(s.before, s.state).length ? s.state : s.before;
}

/** @param {ReturnType<typeof createStroke>} s */
export function strokeAnnouncement(s) {
  const { add, rem } = strokeMarks(s);
  const n = add.size + rem.size;
  if (!n) return "";
  return (
    `${add.size ? "Added" : "Removed"} ${s.d} ${add.size ? "to" : "from"} ${n} ${n === 1 ? "cell" : "cells"}` +
    (s.refused.size ? `; ${s.refused.size} ${s.refused.size === 1 ? "cell" : "cells"} refused` : "")
  );
}
