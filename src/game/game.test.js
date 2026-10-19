import { describe, it, expect } from 'vitest';
import {
  newGame,
  restart,
  valueAt,
  isGiven,
  isEditable,
  computedCandidates,
  hasCandidate,
  blockersOf,
  isLegal,
  conflicts,
  isSolved,
  setAnswer,
  isAdd,
  toggleCandidate,
  eraseAction,
  erase,
  clearCell,
  setNotesMode,
  fillDigit,
  fill,
} from './game.js';
import { maskDigits } from './board.js';
import { PUZZLE, EMPTY, notes, play, solve } from './test-fixtures.js';

const manual = () => newGame(PUZZLE);
const auto = () => newGame(PUZZLE, { notesMode: 'auto' });

describe('new game: board and givens', () => {
  it('givens come from the puzzle string; no answers or notes; Manual by default', () => {
    const s = manual();
    expect(s.notesMode).toBe('manual');
    expect(valueAt(s, 0)).toBe(3);
    expect(isGiven(s, 0)).toBe(true);
    expect(isEditable(s, 0)).toBe(false);
    expect(valueAt(s, EMPTY)).toBe(0);
    expect(isEditable(s, EMPTY)).toBe(true);
    expect(s.answers.every((v) => v === 0)).toBe(true);
    expect(notes(s, EMPTY)).toBe('');
    expect(auto().notesMode).toBe('auto');
  });

  it('out-of-range cells are neither given nor editable', () => {
    const s = manual();
    for (const i of [-1, 81, 1.5, NaN]) {
      expect(isGiven(s, i)).toBe(false);
      expect(isEditable(s, i)).toBe(false);
    }
  });
});

describe('answers', () => {
  it('writes the answer; the same digit clears it; another digit replaces it', () => {
    let s = setAnswer(manual(), EMPTY, 3).state;
    expect(valueAt(s, EMPTY)).toBe(3);
    s = setAnswer(s, EMPTY, 1).state;
    expect(valueAt(s, EMPTY)).toBe(1);
    const r = setAnswer(s, EMPTY, 1);
    expect(r.changed).toBe(true);
    expect(valueAt(r.state, EMPTY)).toBe(0);
  });

  it('never overwrites a given', () => {
    const s = manual();
    const r = setAnswer(s, 0, 9);
    expect(r).toEqual({ state: s, changed: false, blockers: [] });
    expect(r.state).toBe(s);
    expect(valueAt(s, 0)).toBe(3);
  });

  it('accepts a conflicting answer (it shows as a conflict instead)', () => {
    const s = setAnswer(manual(), EMPTY, 4).state;
    expect(valueAt(s, EMPTY)).toBe(4);
  });

  it('does not mutate the previous state', () => {
    const s = manual();
    const before = JSON.stringify(s);
    setAnswer(s, EMPTY, 3);
    toggleCandidate(s, EMPTY, 3);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('rejects digits outside 1-9', () => {
    for (const d of [0, 10, 2.5]) expect(() => setAnswer(manual(), EMPTY, d)).toThrow(RangeError);
  });
});

describe('conflicts', () => {
  it('a repeated digit marks every cell involved; a wrong-but-legal digit marks none', () => {
    let s = setAnswer(manual(), EMPTY, 4).state; // given 4s at 3 (column), 59 (box), 79 (row)
    expect([...conflicts(s)].sort((a, b) => a - b)).toEqual([3, 59, 75, 79]);
    s = setAnswer(s, EMPTY, 1).state; // the solution is 7, but 1 is legal
    expect(conflicts(s).size).toBe(0);
  });

  it('two answers can conflict with each other', () => {
    const s = play(manual(), [setAnswer, 73, 1], [setAnswer, EMPTY, 1]);
    expect([...conflicts(s)].sort((a, b) => a - b)).toEqual([73, 75]);
  });
});

describe('auto candidates', () => {
  it('computed from givens and answers, wrong answers included', () => {
    let s = auto();
    expect(notes(s, EMPTY)).toBe('1379');
    expect(maskDigits(computedCandidates(s, EMPTY))).toEqual([1, 3, 7, 9]);
    s = setAnswer(s, 73, 1).state; // wrong (solution is 6) but still feeds the candidates
    expect(notes(s, EMPTY)).toBe('379');
  });

  it('filled cells show no candidates', () => {
    const s = setAnswer(auto(), EMPTY, 7).state;
    expect(notes(s, EMPTY)).toBe('');
    expect(notes(s, 0)).toBe('');
  });

  it('remove and restore overrides are applied on top of the computed set', () => {
    let s = toggleCandidate(auto(), EMPTY, 3).state;
    expect(notes(s, EMPTY)).toBe('179');
    expect(s.autoRemoved[EMPTY]).not.toBe(0);
    s = toggleCandidate(s, EMPTY, 3).state; // restoring a removed candidate is a legal add
    expect(notes(s, EMPTY)).toBe('1379');
    expect(s.autoRemoved[EMPTY]).toBe(0);
    expect(s.autoAdded[EMPTY]).toBe(0);
  });

  it('a removed candidate stays removed while the board changes around it', () => {
    let s = toggleCandidate(auto(), EMPTY, 3).state;
    s = play(s, [setAnswer, 73, 1], [setAnswer, 73, 1]);
    expect(notes(s, EMPTY)).toBe('179');
  });

  it('an added override (only reachable from a saved snapshot) toggles off without hiding the digit later', () => {
    const base = setAnswer(newGame(PUZZLE, { notesMode: 'auto' }), 76, 7).state; // 7 now blocked in EMPTY
    const s = { ...base, autoAdded: base.autoAdded.map((m, i) => (i === EMPTY ? 1 << 7 : m)) };
    expect(notes(s, EMPTY)).toBe('1379');
    expect(eraseAction(s, EMPTY)).toBe('auto-overrides');
    const off = toggleCandidate(s, EMPTY, 7).state;
    expect(notes(off, EMPTY)).toBe('139');
    expect(off.autoAdded[EMPTY]).toBe(0);
    expect(off.autoRemoved[EMPTY]).toBe(0);
    expect(notes(setAnswer(off, 76, 7).state, EMPTY)).toBe('1379'); // blocker gone: 7 is back
  });

  it('overrides restored after a peer took the digit are refused', () => {
    let s = toggleCandidate(auto(), EMPTY, 3).state;
    s = setAnswer(s, 76, 3).state; // r9c5, same row
    const r = toggleCandidate(s, EMPTY, 3);
    expect(r.changed).toBe(false);
    expect(r.blockers).toEqual([76]);
    expect(notes(r.state, EMPTY)).toBe('179');
  });
});

describe('manual notes', () => {
  it('start empty; toggling adds and removes', () => {
    let s = play(manual(), [toggleCandidate, EMPTY, 7], [toggleCandidate, EMPTY, 1]);
    expect(notes(s, EMPTY)).toBe('17');
    s = toggleCandidate(s, EMPTY, 7).state;
    expect(notes(s, EMPTY)).toBe('1');
  });

  it('stay under an answer and come back when it is cleared', () => {
    let s = play(manual(), [toggleCandidate, EMPTY, 1], [toggleCandidate, EMPTY, 3], [setAnswer, EMPTY, 4]);
    expect(notes(s, EMPTY)).toBe('');
    s = setAnswer(s, EMPTY, 4).state;
    expect(notes(s, EMPTY)).toBe('13');
  });

  it('cannot be toggled on a given or an answered cell', () => {
    const s = setAnswer(manual(), EMPTY, 7).state;
    expect(toggleCandidate(s, EMPTY, 1).state).toBe(s);
    expect(toggleCandidate(s, 0, 1).state).toBe(s);
  });
});

describe('notes mode', () => {
  it('switching shows the other set; both sets are kept', () => {
    let s = play(manual(), [toggleCandidate, EMPTY, 7], [toggleCandidate, EMPTY, 9]);
    s = setNotesMode(s, 'auto');
    expect(notes(s, EMPTY)).toBe('1379');
    s = toggleCandidate(s, EMPTY, 3).state;
    expect(notes(s, EMPTY)).toBe('179');
    s = setNotesMode(s, 'manual');
    expect(notes(s, EMPTY)).toBe('79');
    s = setNotesMode(s, 'auto');
    expect(notes(s, EMPTY)).toBe('179');
  });

  it('setting the current mode returns the same state; unknown modes throw', () => {
    const s = manual();
    expect(setNotesMode(s, 'manual')).toBe(s);
    expect(() => setNotesMode(s, /** @type {any} */ ('pen'))).toThrow(RangeError);
  });
});

describe('legality and blockers', () => {
  it('blockers are the peers already holding the digit', () => {
    const s = manual();
    expect(blockersOf(s, EMPTY, 4)).toEqual([3, 59, 79]);
    expect(isLegal(s, EMPTY, 4)).toBe(false);
    expect(blockersOf(s, EMPTY, 1)).toEqual([]);
    expect(isLegal(s, EMPTY, 1)).toBe(true);
  });

  it('judged only against the board: an answer blocks, the solution is never consulted', () => {
    const s = setAnswer(manual(), 76, 7).state; // wrong answer 7 in the row
    expect(blockersOf(s, EMPTY, 7)).toEqual([76]);
    expect(isLegal(s, EMPTY, 1)).toBe(true); // 1 is not EMPTY's solution, but legal
  });
});

describe('toggling a candidate refuses illegal adds', () => {
  it('Manual: refused, state untouched, every blocker listed', () => {
    const s = manual();
    const r = toggleCandidate(s, EMPTY, 4);
    expect(r).toEqual({ state: s, changed: false, blockers: [3, 59, 79] });
    expect(r.state).toBe(s);
  });

  it('Auto: refused, the computed candidates are left alone', () => {
    const s = auto();
    const r = toggleCandidate(s, EMPTY, 4);
    expect(r.state).toBe(s);
    expect(r.blockers).toEqual([3, 59, 79]);
    expect(notes(s, EMPTY)).toBe('1379');
    expect(isAdd(s, EMPTY, 4)).toBe(true);
    expect(isAdd(s, EMPTY, 3)).toBe(false);
  });

  it('removal is always allowed; notes made illegal later are left alone until removed', () => {
    let s = toggleCandidate(manual(), EMPTY, 1).state;
    s = setAnswer(s, 76, 1).state; // now 1 sits in the row
    expect(notes(s, EMPTY)).toBe('1');
    const removed = toggleCandidate(s, EMPTY, 1);
    expect(removed.changed).toBe(true);
    expect(removed.blockers).toEqual([]);
    expect(notes(removed.state, EMPTY)).toBe('');
    const again = toggleCandidate(removed.state, EMPTY, 1);
    expect(again.changed).toBe(false);
    expect(again.blockers).toEqual([76]);
  });

  it('a wrong-but-legal note is accepted', () => {
    const r = toggleCandidate(setAnswer(manual(), 76, 7).state, EMPTY, 1);
    expect(r.changed).toBe(true);
    expect(notes(r.state, EMPTY)).toBe('1');
  });
});

describe('Erase', () => {
  it('nothing to erase on a given, out of range, or an empty cell without notes', () => {
    for (const s of [manual(), auto()]) {
      expect(eraseAction(s, 0)).toBe(null);
      expect(eraseAction(s, -1)).toBe(null);
      expect(eraseAction(s, EMPTY)).toBe(null);
      expect(erase(s, 0).state).toBe(s);
      expect(erase(s, EMPTY).state).toBe(s);
    }
  });

  it('Manual: the answer first (notes come back), then the notes', () => {
    let s = play(manual(), [toggleCandidate, EMPTY, 1], [toggleCandidate, EMPTY, 3], [setAnswer, EMPTY, 4]);
    expect(eraseAction(s, EMPTY)).toBe('answer');
    s = erase(s, EMPTY).state;
    expect(valueAt(s, EMPTY)).toBe(0);
    expect(notes(s, EMPTY)).toBe('13');
    expect(eraseAction(s, EMPTY)).toBe('manual-notes');
    s = erase(s, EMPTY).state;
    expect(notes(s, EMPTY)).toBe('');
    expect(eraseAction(s, EMPTY)).toBe(null);
  });

  it('Auto: the answer first (overrides come back), then the overrides reset; never blanks the cell', () => {
    let s = play(auto(), [toggleCandidate, EMPTY, 3], [setAnswer, EMPTY, 1]);
    s = erase(s, EMPTY).state;
    expect(valueAt(s, EMPTY)).toBe(0);
    expect(notes(s, EMPTY)).toBe('179');
    expect(eraseAction(s, EMPTY)).toBe('auto-overrides');
    s = erase(s, EMPTY).state;
    expect(notes(s, EMPTY)).toBe('1379');
    expect(eraseAction(s, EMPTY)).toBe(null);
    expect(erase(s, EMPTY).state).toBe(s);
  });

  it('Auto: nothing to erase when the only overrides are stale', () => {
    let s = toggleCandidate(auto(), EMPTY, 3).state;
    s = setAnswer(s, 76, 3).state; // a peer takes 3: the removal no longer shows
    expect(s.autoRemoved[EMPTY]).not.toBe(0);
    expect(notes(s, EMPTY)).toBe('179');
    expect(eraseAction(s, EMPTY)).toBe(null);
    const r = erase(s, EMPTY);
    expect(r.changed).toBe(false);
    expect(r.state).toBe(s);
    expect(clearCell(s, EMPTY).state).toBe(s);
    // The removal still applies once the peer's 3 is gone.
    expect(notes(setAnswer(s, 76, 3).state, EMPTY)).toBe('179');
  });

  it('Auto: a stale override next to a live one: Erase resets both', () => {
    let s = play(auto(), [toggleCandidate, EMPTY, 3], [toggleCandidate, EMPTY, 1], [setAnswer, 76, 3]);
    expect(notes(s, EMPTY)).toBe('79');
    expect(eraseAction(s, EMPTY)).toBe('auto-overrides');
    s = erase(s, EMPTY).state;
    expect(notes(s, EMPTY)).toBe('179');
    expect(s.autoRemoved[EMPTY]).toBe(0);
    expect(notes(setAnswer(s, 76, 3).state, EMPTY)).toBe('1379');
  });

  it('Auto: an added override for a digit that is computed anyway is stale too', () => {
    const base = auto();
    const s = { ...base, autoAdded: base.autoAdded.map((m, i) => (i === EMPTY ? 1 << 3 : m)) };
    expect(notes(s, EMPTY)).toBe('1379');
    expect(eraseAction(s, EMPTY)).toBe(null);
    expect(erase(s, EMPTY).state).toBe(s);
  });

  it('Auto: resets after restoring one candidate and removing another', () => {
    let s = play(auto(), [toggleCandidate, EMPTY, 7], [toggleCandidate, EMPTY, 1], [toggleCandidate, EMPTY, 7]);
    expect(notes(s, EMPTY)).toBe('379');
    s = erase(s, EMPTY).state;
    expect(notes(s, EMPTY)).toBe('1379');
  });

  it('erasing in Manual leaves Auto overrides intact', () => {
    let s = toggleCandidate(auto(), EMPTY, 1).state;
    s = setNotesMode(s, 'manual');
    expect(eraseAction(s, EMPTY)).toBe(null);
    s = play(s, [toggleCandidate, EMPTY, 7], [erase, EMPTY]);
    expect(notes(s, EMPTY)).toBe('');
    expect(notes(setNotesMode(s, 'auto'), EMPTY)).toBe('379');
  });

  it('erasing in Auto leaves Manual notes intact', () => {
    let s = play(manual(), [toggleCandidate, EMPTY, 7], [toggleCandidate, EMPTY, 9]);
    s = setNotesMode(s, 'auto');
    expect(eraseAction(s, EMPTY)).toBe(null);
    s = play(s, [toggleCandidate, EMPTY, 3], [erase, EMPTY]);
    expect(notes(s, EMPTY)).toBe('1379');
    expect(notes(setNotesMode(s, 'manual'), EMPTY)).toBe('79');
  });
});

describe('right-click clear', () => {
  it('Auto: the answer and its overrides go in one action', () => {
    let s = play(auto(), [toggleCandidate, EMPTY, 1], [setAnswer, EMPTY, 7]);
    const r = clearCell(s, EMPTY);
    expect(r.changed).toBe(true);
    expect(valueAt(r.state, EMPTY)).toBe(0);
    expect(notes(r.state, EMPTY)).toBe('1379');
    // Erase on the same cell would keep the override.
    expect(notes(erase(s, EMPTY).state, EMPTY)).toBe('379');
  });

  it('Manual: only the answer goes; the notes come back', () => {
    const s = play(manual(), [toggleCandidate, 42, 2], [setAnswer, 42, 3]);
    const r = clearCell(s, 42);
    expect(valueAt(r.state, 42)).toBe(0);
    expect(notes(r.state, 42)).toBe('2');
  });

  it('an empty cell gets Erase; a given is untouched', () => {
    let s = toggleCandidate(auto(), EMPTY, 9).state;
    s = clearCell(s, EMPTY).state;
    expect(notes(s, EMPTY)).toBe('1379');
    expect(clearCell(s, EMPTY).state).toBe(s);
    expect(clearCell(s, 0).state).toBe(s);
    const m = toggleCandidate(manual(), EMPTY, 9).state;
    expect(notes(clearCell(m, EMPTY).state, EMPTY)).toBe('');
  });
});

describe('fill rule (lone candidate or highlighted digit)', () => {
  it('Auto: a lone candidate fills', () => {
    const s = auto();
    expect(fillDigit(s, 55)).toBe(9);
    expect(valueAt(fill(s, 55).state, 55)).toBe(9);
  });

  it('Auto: uses the candidates currently shown, overrides included', () => {
    const s = toggleCandidate(auto(), 5, 1).state; // leaves only 5
    expect(notes(s, 5)).toBe('5');
    expect(valueAt(fill(s, 5).state, 5)).toBe(5);
  });

  it('Auto: the highlighted digit wins on a multi-candidate cell', () => {
    const s = auto();
    expect(notes(s, 36)).toBe('1268');
    expect(fillDigit(s, 36)).toBe(0);
    expect(fillDigit(s, 36, 8)).toBe(8);
    expect(valueAt(fill(s, 36, 8).state, 36)).toBe(8);
  });

  it('Auto: a highlighted digit that is not a candidate falls back to the lone candidate', () => {
    expect(fillDigit(auto(), 55, 8)).toBe(9);
    expect(fillDigit(auto(), EMPTY, 4)).toBe(0);
  });

  it('Manual: never fills, even a single note or the highlighted digit', () => {
    const s = play(manual(), [toggleCandidate, EMPTY, 3], [toggleCandidate, 36, 1], [toggleCandidate, 36, 8]);
    expect(fillDigit(s, EMPTY)).toBe(0);
    expect(fillDigit(s, 36, 8)).toBe(0);
    expect(fill(s, EMPTY).state).toBe(s);
  });

  it('never on a given or an answered cell', () => {
    const s = setAnswer(auto(), 55, 9).state;
    expect(fillDigit(s, 55)).toBe(0);
    expect(fillDigit(s, 0, 3)).toBe(0);
  });
});

describe('solved check', () => {
  it('solved only when every cell is filled and nothing repeats', () => {
    let s = auto();
    expect(isSolved(s)).toBe(false);
    const solution = solve(s);
    for (let i = 0; i < 81; i++) if (isEditable(s, i)) s = setAnswer(s, i, solution[i]).state;
    expect(isSolved(s)).toBe(true);
    expect(conflicts(s).size).toBe(0);

    const gap = setAnswer(s, EMPTY, solution[EMPTY]).state; // same digit clears
    expect(isSolved(gap)).toBe(false);
    const wrong = setAnswer(s, EMPTY, 4).state;
    expect(isSolved(wrong)).toBe(false);
  });
});

describe('restart', () => {
  it('clears answers and both note sets; keeps the puzzle and notes mode', () => {
    let s = play(auto(), [toggleCandidate, EMPTY, 3], [setAnswer, 55, 9]);
    s = setNotesMode(s, 'manual');
    s = toggleCandidate(s, 36, 1).state;
    const r = restart(s);
    expect(r.notesMode).toBe('manual');
    expect(r.givens).toEqual(s.givens);
    expect(valueAt(r, 55)).toBe(0);
    expect(notes(r, 36)).toBe('');
    expect(notes(setNotesMode(r, 'auto'), EMPTY)).toBe('1379');
    expect(hasCandidate(setNotesMode(r, 'auto'), EMPTY, 3)).toBe(true);
  });
});
