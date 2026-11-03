import { describe, expect, it } from "vitest";
import { findStep, TECHNIQUES } from "./engine.js";
import corpus from "./fixtures/phase-three-corpus.json";
import {
  assertOracleStep,
  exactCover,
  oracleLegalMasks,
  validateCorpusFixture,
} from "./phase-three-oracle.mjs";

const ids = corpus.queries.map((query) => query.techniqueId);
const blank = () => Array(81).fill(0);
const all = () => Array(81).fill(1022);

describe("independent Algorithm X oracle", () => {
  it("distinguishes no solution, one solution and multiple solutions", () => {
    const solved = [...corpus.fixtures[0].solution].map(Number);
    expect(exactCover(solved, oracleLegalMasks(solved), { maxSolutions: 2 }).solutions).toEqual([
      solved.join(""),
    ]);
    const invalid = [...solved];
    invalid[0] = invalid[1];
    expect(exactCover(invalid).solutions).toEqual([]);
    expect(exactCover(blank(), all(), { maxSolutions: 2 }).solutions).toHaveLength(2);
  });

  it("rejects agreement with only one solution and reports budget exhaustion as inconclusive", () => {
    const step = {
      placements: [],
      eliminations: [{ cell: 0, digit: 1 }],
    };
    expect(() => assertOracleStep(blank(), all(), step)).toThrow("unsound");
    expect(() =>
      assertOracleStep(blank(), all(), { placements: step.eliminations, eliminations: [] })
    ).toThrow("unsound");
    expect(() => exactCover(blank(), all(), { maxNodes: 1 })).toThrow("inconclusive");
  });

  for (const fixture of corpus.fixtures)
    it(`rechecks original uniqueness and candidate consistency: ${fixture.id}`, () => {
      expect(validateCorpusFixture(fixture).validatedUnique).toBe(true);
    });
});

describe("phase-three strategy semantic regression", () => {
  it("registers all 12 explicitly requested technique IDs", () => {
    expect(ids).toHaveLength(12);
    for (const id of ids) expect(TECHNIQUES).toContain(id);
  });

  for (const id of ids) {
    it(`does not manufacture ${id} on an unrestricted multi-solution board`, () => {
      expect(findStep(blank(), all(), id)).toBeNull();
    });

    it(`independently proves every ${id} effect on genuine archived states`, () => {
      let found = 0;
      for (const fixture of corpus.fixtures) {
        const values = [...fixture.values].map(Number);
        const masks = [...fixture.masks];
        const original = [...masks];
        const step = findStep(values, masks, id);
        expect(masks, `${id} mutates ${fixture.id}`).toEqual(original);
        expect(values.join(""), `${id} mutates values`).toBe(fixture.values);
        if (!step) continue;
        found++;
        expect(step.techniqueId).toBe(id);
        expect(step.premiseCells.length).toBeGreaterThan(0);
        expect(step.reason.trim().length).toBeGreaterThan(0);
        expect(() => assertOracleStep(values, masks, step), `${id}: ${fixture.id}`).not.toThrow();
        const hidden = findStep(values, masks, id, blank());
        expect(hidden?.eliminations ?? []).toEqual([]);
      }
      // Scarce positives must be visible as a failure, never quietly counted as
      // successful coverage. Prior upstream hits do not certify our detector.
      expect(found, `No genuine positive for ${id}`).toBeGreaterThan(0);
    }, 30000);
  }

  it("preserves a completion under 24 seeded, independently checked candidate perturbations", () => {
    let seed = 0x20261103;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const solution = [...corpus.fixtures[0].solution].map(Number);
    for (let sample = 0; sample < 24; sample++) {
      const values = solution.map((digit) => (random() < 0.2 ? digit : 0));
      const legal = oracleLegalMasks(values);
      const masks = legal.map((mask, cell) => {
        for (let digit = 1; digit <= 9; digit++)
          if (digit !== solution[cell] && random() < 0.55) mask &= ~(1 << digit);
        return mask;
      });
      for (const id of ids) {
        const step = findStep(values, masks, id);
        if (step)
          expect(
            () => assertOracleStep(values, masks, step),
            `${id} sample ${sample}`
          ).not.toThrow();
      }
    }
  }, 60000);
});
