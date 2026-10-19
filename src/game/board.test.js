import { describe, it, expect } from 'vitest';
import { PEERS, rowOf, colOf, boxOf, bit, maskDigits, digitsMask, popcount, parsePuzzle, ALL_DIGITS } from './board.js';
import { PUZZLE } from './test-fixtures.js';

describe('board geometry', () => {
  it('maps cells to rows, columns and boxes', () => {
    expect([rowOf(0), colOf(0), boxOf(0)]).toEqual([0, 0, 0]);
    expect([rowOf(40), colOf(40), boxOf(40)]).toEqual([4, 4, 4]);
    expect([rowOf(75), colOf(75), boxOf(75)]).toEqual([8, 3, 7]);
    expect([rowOf(80), colOf(80), boxOf(80)]).toEqual([8, 8, 8]);
  });

  it('every cell has 20 distinct peers, symmetric, never itself', () => {
    for (let i = 0; i < 81; i++) {
      expect(new Set(PEERS[i]).size).toBe(20);
      expect(PEERS[i]).not.toContain(i);
      for (const p of PEERS[i]) expect(PEERS[p]).toContain(i);
    }
    expect(PEERS[0]).toEqual(expect.arrayContaining([1, 8, 9, 10, 20, 72]));
    expect(PEERS[0]).not.toContain(30);
  });
});

describe('digit masks', () => {
  it('round-trips digits and counts them', () => {
    expect(maskDigits(digitsMask([9, 1, 3]))).toEqual([1, 3, 9]);
    expect(maskDigits(0)).toEqual([]);
    expect(maskDigits(ALL_DIGITS)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(popcount(bit(4) | bit(7))).toBe(2);
    expect(popcount(ALL_DIGITS)).toBe(9);
  });
});

describe('parsePuzzle', () => {
  it('reads 81 digits, 0 for empty', () => {
    const g = parsePuzzle(PUZZLE);
    expect(g).toHaveLength(81);
    expect(g.slice(0, 9)).toEqual([3, 8, 7, 4, 9, 0, 0, 0, 0]);
    expect(g.filter(Boolean)).toHaveLength(38);
  });

  it('rejects anything else', () => {
    for (const bad of ['', PUZZLE.slice(1), PUZZLE + '0', PUZZLE.replace('3', '.'), null, 42]) {
      expect(() => parsePuzzle(/** @type {any} */ (bad))).toThrow(/81 digits/);
    }
  });
});
