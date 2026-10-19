import { describe, it, expect } from 'vitest';
import { newGame, setAnswer, toggleCandidate, setNotesMode, erase, valueAt } from './game.js';
import { toSnapshot, fromSnapshot } from './snapshot.js';
import { PUZZLE, EMPTY, notes, play } from './test-fixtures.js';

function progressed() {
  let s = play(newGame(PUZZLE), [toggleCandidate, 36, 1], [toggleCandidate, 36, 8], [setAnswer, 55, 9]);
  s = setNotesMode(s, 'auto');
  return play(s, [toggleCandidate, EMPTY, 3], [setAnswer, 73, 1]);
}

describe('snapshot', () => {
  it('is plain JSON with answers, notesMode, manualNotes and autoOverrides', () => {
    const snap = toSnapshot(progressed());
    expect(snap.version).toBe(1);
    expect(snap.puzzle).toBe(PUZZLE);
    expect(snap.answers).toHaveLength(81);
    expect(snap.answers[55]).toBe('9');
    expect(snap.answers[73]).toBe('1');
    expect(snap.answers.replace(/[19]/g, '0')).toBe('0'.repeat(81));
    expect(snap.notesMode).toBe('auto');
    expect(snap.manualNotes[36]).toBe('18');
    expect(snap.manualNotes.filter(Boolean)).toEqual(['18']);
    expect(snap.autoOverrides.removed[EMPTY]).toBe('3');
    expect(snap.autoOverrides.added.every((s) => s === '')).toBe(true);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it('round-trips through JSON to an equal, working state', () => {
    const s = progressed();
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back).toEqual(s);
    expect(notes(back, EMPTY)).toBe('79'); // 3 removed, 1 taken by the answer at 73
    expect(notes(erase(back, EMPTY).state, EMPTY)).toBe('379'); // overrides survive the trip
    expect(notes(setNotesMode(back, 'manual'), 36)).toBe('18');
    expect(valueAt(back, 55)).toBe(9);
  });

  it('a fresh game round-trips too', () => {
    const s = newGame(PUZZLE);
    expect(fromSnapshot(toSnapshot(s))).toEqual(s);
  });

  it('rejects malformed snapshots', () => {
    const good = toSnapshot(progressed());
    const bad = [
      null,
      'x',
      { ...good, version: 2 },
      { ...good, puzzle: PUZZLE.slice(1) },
      { ...good, answers: '3' + good.answers.slice(1) }, // answer on the given at cell 0
      { ...good, answers: good.answers.replace('9', 'x') },
      { ...good, notesMode: 'pen' },
      { ...good, manualNotes: good.manualNotes.slice(1) },
      { ...good, manualNotes: good.manualNotes.map((n, i) => (i === 36 ? '10' : n)) },
      { ...good, autoOverrides: undefined },
      { ...good, autoOverrides: { added: good.autoOverrides.added } },
    ];
    for (const b of bad) expect(() => fromSnapshot(b)).toThrow();
  });
});
