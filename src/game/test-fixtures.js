// Shared fixtures for the game core tests (the prototype's demo puzzle).
import { candidates, valueAt } from './game.js';
import { maskDigits, PEERS } from './board.js';

/** NYT Easy 2025-08-05. */
export const PUZZLE =
  '387490000' +
  '050630804' +
  '040800593' +
  '070080451' +
  '004500000' +
  '905006700' +
  '000064105' +
  '430002007' +
  '502008040';

/** Row 9, col 4: empty, candidates 1379. 4 is blocked by the given 4s at 3 (column), 59 (box) and 79 (row). */
export const EMPTY = 75;

/** The shown candidates of cell i as a digit string, e.g. '1379'. */
export const notes = (state, i) => maskDigits(candidates(state, i)).join('');

/** Applies actions in order: each is `[fn, ...args]` and must return an ActionResult. */
export function play(state, ...actions) {
  let s = state;
  for (const [fn, ...args] of actions) s = fn(s, ...args).state;
  return s;
}

/** Backtracking solver over a game state's current values. */
export function solve(state) {
  const g = Array.from({ length: 81 }, (_, i) => valueAt(state, i));
  const go = () => {
    const i = g.indexOf(0);
    if (i < 0) return true;
    for (let d = 1; d <= 9; d++) {
      if (PEERS[i].some((p) => g[p] === d)) continue;
      g[i] = d;
      if (go()) return true;
    }
    g[i] = 0;
    return false;
  };
  if (!go()) throw new Error('unsolvable');
  return g;
}
