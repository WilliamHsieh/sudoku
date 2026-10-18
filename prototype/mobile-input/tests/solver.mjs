// Test-only Sudoku helpers: solution counting and a singles-only solver.
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3);
  const s = new Set();
  for (let k = 0; k < 9; k++) { s.add(r * 9 + k); s.add(k * 9 + c); }
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) s.add((br + dr) * 9 + bc + dc);
  s.delete(i);
  return [...s];
});
const UNITS = [];
for (let k = 0; k < 9; k++) {
  UNITS.push(Array.from({ length: 9 }, (_, j) => k * 9 + j));
  UNITS.push(Array.from({ length: 9 }, (_, j) => j * 9 + k));
  const br = Math.floor(k / 3) * 3, bc = (k % 3) * 3;
  UNITS.push(Array.from({ length: 9 }, (_, j) => (br + Math.floor(j / 3)) * 9 + bc + (j % 3)));
}

const grid = (s) => [...s].map(Number);
const options = (g, i) => {
  const used = new Set(PEERS[i].map((p) => g[p]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d));
};

export const givenCount = (s) => grid(s).filter(Boolean).length;

/** Number of solutions, capped at `limit`. */
export function countSolutions(s, limit = 2) {
  const g = grid(s);
  let n = 0;
  (function go() {
    let best = -1, bestOpts;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const o = options(g, i);
      if (!o.length) return;
      if (!bestOpts || o.length < bestOpts.length) { best = i; bestOpts = o; }
    }
    if (best < 0) { n++; return; }
    for (const d of bestOpts) {
      g[best] = d;
      go();
      if (n >= limit) break;
    }
    g[best] = 0;
  })();
  return n;
}

/** Fills naked and hidden singles until stuck; returns the cells still empty. */
export function singlesOnly(s) {
  const g = grid(s);
  for (let progress = true; progress;) {
    progress = false;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const o = options(g, i);
      if (o.length === 1) { g[i] = o[0]; progress = true; }
    }
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        if (unit.some((i) => g[i] === d)) continue;
        const spots = unit.filter((i) => !g[i] && options(g, i).includes(d));
        if (spots.length === 1) { g[spots[0]] = d; progress = true; }
      }
    }
  }
  return g.filter((v) => !v).length;
}
