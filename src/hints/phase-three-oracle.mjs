// Test/benchmark-only independent exact-cover oracle. Never imported by production.
// This is Algorithm X with dancing links, not the production MRV Sudoku solver.
const ALL = 1022;
const bit = (digit) => 1 << digit;

export function oracleLegalMasks(values) {
  if (values.length !== 81 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 9))
    throw new Error("Oracle: invalid values");
  return values.map((value, cell) => {
    if (value) return 0;
    let mask = ALL;
    for (let peer = 0; peer < 81; peer++) {
      if (
        Math.floor(cell / 9) === Math.floor(peer / 9) ||
        cell % 9 === peer % 9 ||
        (Math.floor(cell / 27) === Math.floor(peer / 27) &&
          Math.floor((cell % 9) / 3) === Math.floor((peer % 9) / 3))
      )
        mask &= ~bit(values[peer]);
    }
    return mask;
  });
}

export function exactCover(values, masks = oracleLegalMasks(values), options = {}) {
  const { maxSolutions = 1, maxNodes = 2000000 } = options;
  const legal = oracleLegalMasks(values);
  if (masks.length !== 81 || masks.some((m, i) => !Number.isInteger(m) || m < 0 || m & ~legal[i]))
    throw new Error("Oracle: invalid masks");
  const left = [],
    right = [],
    up = [],
    down = [],
    column = [],
    assignment = [],
    sizes = [];
  for (let c = 0; c <= 324; c++) {
    left[c] = c - 1;
    right[c] = c + 1;
    up[c] = down[c] = c;
    column[c] = c;
    sizes[c] = 0;
  }
  left[0] = 324;
  right[324] = 0;
  let next = 325;
  for (let cell = 0; cell < 81; cell++) {
    const row = Math.floor(cell / 9),
      col = cell % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
    const choices = values[cell] ? bit(values[cell]) : masks[cell];
    for (let digit = 1; digit <= 9; digit++) {
      if (!(choices & bit(digit))) continue;
      const constraints = [
        cell,
        81 + row * 9 + digit - 1,
        162 + col * 9 + digit - 1,
        243 + box * 9 + digit - 1,
      ];
      const first = next;
      for (let j = 0; j < 4; j++) {
        const n = next++,
          c = constraints[j] + 1;
        left[n] = j ? n - 1 : first + 3;
        right[n] = j === 3 ? first : n + 1;
        column[n] = c;
        assignment[n] = cell * 9 + digit - 1;
        up[n] = up[c];
        down[n] = c;
        down[up[c]] = n;
        up[c] = n;
        sizes[c]++;
      }
    }
  }
  function cover(c) {
    right[left[c]] = right[c];
    left[right[c]] = left[c];
    for (let row = down[c]; row !== c; row = down[row])
      for (let n = right[row]; n !== row; n = right[n]) {
        down[up[n]] = down[n];
        up[down[n]] = up[n];
        sizes[column[n]]--;
      }
  }
  function uncover(c) {
    for (let row = up[c]; row !== c; row = up[row])
      for (let n = left[row]; n !== row; n = left[n]) {
        sizes[column[n]]++;
        down[up[n]] = n;
        up[down[n]] = n;
      }
    right[left[c]] = c;
    left[right[c]] = c;
  }
  let nodes = 0;
  const solutions = [],
    chosen = [];
  function search() {
    if (++nodes > maxNodes) throw new Error("Oracle: node budget exhausted (inconclusive)");
    if (!right[0]) {
      const solution = Array(81).fill(0);
      for (const n of chosen) {
        const a = assignment[n];
        solution[Math.floor(a / 9)] = (a % 9) + 1;
      }
      solutions.push(solution.join(""));
      return solutions.length >= maxSolutions;
    }
    let c = right[0];
    for (let j = right[c]; j; j = right[j]) if (sizes[j] < sizes[c]) c = j;
    if (!sizes[c]) return false;
    cover(c);
    for (let row = down[c]; row !== c; row = down[row]) {
      chosen.push(row);
      for (let n = right[row]; n !== row; n = right[n]) cover(column[n]);
      const stop = search();
      for (let n = left[row]; n !== row; n = left[n]) uncover(column[n]);
      chosen.pop();
      if (stop) {
        uncover(c);
        return true;
      }
    }
    uncover(c);
    return false;
  }
  search();
  return { solutions, nodes, exhaustive: solutions.length < maxSolutions };
}

export function assertOracleStep(values, masks, step) {
  if (!step || !(step.placements?.length || step.eliminations?.length))
    throw new Error("Oracle: empty step");
  const base = exactCover(values, masks);
  if (!base.solutions.length) throw new Error("Oracle: unsatisfiable premise");
  let nodes = base.nodes;
  const seen = new Set();
  for (const kind of ["placements", "eliminations"]) {
    for (const effect of step[kind] ?? []) {
      const { cell, digit } = effect;
      const key = `${kind}:${cell}:${digit}`;
      if (
        !Number.isInteger(cell) ||
        cell < 0 ||
        cell >= 81 ||
        values[cell] ||
        !Number.isInteger(digit) ||
        digit < 1 ||
        digit > 9 ||
        !(masks[cell] & bit(digit)) ||
        seen.has(key)
      )
        throw new Error("Oracle: invalid or duplicate effect");
      seen.add(key);
      const alternate = [...masks];
      if (kind === "placements") alternate[cell] &= ~bit(digit);
      else alternate[cell] = bit(digit);
      const counterexample = exactCover(values, alternate);
      nodes += counterexample.nodes;
      if (counterexample.solutions.length)
        throw new Error(
          `Oracle: unsound ${kind} r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}=${digit}`
        );
    }
  }
  return { nodes, effects: seen.size };
}

export function validateCorpusFixture(fixture) {
  const original = [...fixture.puzzle].map(Number);
  const values = [...fixture.values].map(Number);
  const completion = exactCover(original, oracleLegalMasks(original), { maxSolutions: 2 });
  if (completion.solutions.length !== 1 || !completion.exhaustive)
    throw new Error(`Oracle: original puzzle is not unique: ${fixture.id}`);
  if (completion.solutions[0] !== fixture.solution)
    throw new Error(`Oracle: recorded solution mismatch: ${fixture.id}`);
  const legal = oracleLegalMasks(values);
  for (let cell = 0; cell < 81; cell++) {
    if (original[cell] && values[cell] !== original[cell]) throw new Error("Oracle: changed given");
    if (values[cell] && values[cell] !== Number(fixture.solution[cell]))
      throw new Error("Oracle: incorrect placed value");
    if (fixture.masks[cell] & ~legal[cell]) throw new Error("Oracle: illegal candidate");
    if (!values[cell] && !(fixture.masks[cell] & bit(Number(fixture.solution[cell]))))
      throw new Error("Oracle: missing solution candidate");
  }
  return { nodes: completion.nodes, validatedUnique: true };
}
