import { test, expect } from '@playwright/test';
import { PUZZLE } from '../puzzle.js';
import { countSolutions, givenCount, singlesOnly } from './solver.mjs';

test('demo puzzle is hard: 22-26 givens, exactly one solution, singles alone stall', () => {
  expect(PUZZLE).toMatch(/^\d{81}$/);
  const givens = givenCount(PUZZLE);
  expect(givens).toBeGreaterThanOrEqual(22);
  expect(givens).toBeLessThanOrEqual(26);
  expect(countSolutions(PUZZLE, 2)).toBe(1);
  expect(singlesOnly(PUZZLE)).toBeGreaterThan(0);
});
