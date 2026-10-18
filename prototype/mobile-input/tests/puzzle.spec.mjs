import { test, expect } from '@playwright/test';
import { PUZZLE } from '../puzzle.js';
import { countSolutions, givenCount, singlesOnly } from './solver.mjs';

test('demo puzzle is easy: plenty of givens, exactly one solution, singles alone solve it', () => {
  expect(PUZZLE).toMatch(/^\d{81}$/);
  expect(givenCount(PUZZLE)).toBeGreaterThanOrEqual(32);
  expect(countSolutions(PUZZLE, 2)).toBe(1);
  expect(singlesOnly(PUZZLE)).toBe(0);
});
