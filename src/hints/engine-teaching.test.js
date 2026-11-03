import { describe, expect, it } from "vitest";
import { findHint, findStep } from "./engine.js";
import { ADVANCED_TECHNIQUES } from "./engine-advanced.js";
import { legalMasks } from "./proof-verifier.js";
import { newGame } from "../game/game.js";
import corpus from "./fixtures/phase-three-corpus.json";
import medusaExample from "./fixtures/phase-three-medusa-explanation.json";
import { assertOracleStep, validateCorpusFixture } from "./phase-three-oracle.mjs";

const coordinate = (cell) => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`;

describe("advanced hints teach the board facts before the deduction", () => {
  it("independently validates the genuine first-Medusa phone example", () => {
    const fixture = medusaExample.fixture;
    expect(validateCorpusFixture(fixture).validatedUnique).toBe(true);
    const values = [...fixture.values].map(Number);
    const step = findStep(values, fixture.masks);
    expect(step.techniqueId).toBe("3d-medusa");
    expect(() => assertOracleStep(values, fixture.masks, step)).not.toThrow();
  });
  for (const id of ADVANCED_TECHNIQUES)
    it(`${id} supplies concrete observations, causal steps and a target connection`, () => {
      let found = 0;
      for (const fixture of corpus.fixtures) {
        const step = findStep([...fixture.values].map(Number), fixture.masks, id);
        if (!step) continue;
        found++;
        const teaching = step.teaching;
        expect(teaching, `${id}: ${fixture.id}`).toBeDefined();
        expect(teaching.observeTitle.length).toBeGreaterThan(4);
        expect(teaching.reasonTitle.length).toBeGreaterThan(4);
        expect(teaching.observe.length).toBeGreaterThanOrEqual(2);
        expect(teaching.reasoning.length).toBeGreaterThanOrEqual(2);
        expect(teaching.conclusion.length).toBeGreaterThanOrEqual(1);
        for (const paragraph of [
          ...teaching.observe,
          ...teaching.reasoning,
          ...teaching.conclusion,
        ])
          expect(paragraph.trim().length).toBeGreaterThan(0);
        expect(teaching.observe.join(" ")).toMatch(/r[1-9]c[1-9]/);
        expect(teaching.reasoning.join(" ")).toMatch(/r[1-9]c[1-9]/);
        const explanation = [...teaching.reasoning, ...teaching.conclusion].join(" ");
        for (const effect of [...step.placements, ...step.eliminations])
          expect(explanation, `${id}: target ${coordinate(effect.cell)}`).toContain(
            coordinate(effect.cell)
          );
        // Every concrete cell named in the explanation is a highlighted premise
        // or effect. Text must not point at an unrelated, unmarked board cell.
        const marked = new Set([
          ...step.premiseCells,
          ...step.placements.map((e) => e.cell),
          ...step.eliminations.map((e) => e.cell),
        ]);
        for (const [, r, c] of step.reason.matchAll(/r([1-9])c([1-9])/g))
          expect(marked.has((Number(r) - 1) * 9 + Number(c) - 1), step.reason).toBe(true);
        expect(step.reason).not.toMatch(/位置類別|沿鏈逐格排除/);
      }
      expect(found, `Missing teaching positive for ${id}`).toBeGreaterThan(0);
    });

  for (const name of [
    "WXYZ_WING",
    "GROUPED_X_CYCLES",
    "ALS_XY_WING",
    "AIC",
    "DEATH_BLOSSOM",
    "ALIGNED_PAIR_EXCLUSION",
    "trace:wiki:067:20",
  ])
    it(`passes the structured explanation through the real hint API: ${name}`, () => {
      const fixture = [...corpus.fixtures, medusaExample.fixture].find(
        (f) => f.id === name || f.id === `upstream-example:${name}`
      );
      const initial = newGame(fixture.values, { notesMode: "auto" });
      const state = {
        ...initial,
        autoRemoved: legalMasks(initial.givens).map((mask, cell) => mask & ~fixture.masks[cell]),
      };
      const step = findStep([...initial.givens], fixture.masks);
      const hint = findHint(state);
      expect(hint.stages[0].title).toBe(step.teaching.observeTitle);
      expect(hint.stages[0].description.slice(0, -1)).toEqual(step.teaching.observe);
      expect(hint.stages[0].description.at(-1)).toContain("Auto");
      expect(hint.stages[1].title).toBe(step.teaching.reasonTitle);
      expect(hint.stages[1].description).toEqual(step.teaching.reasoning);
      expect(hint.stages[2].description).toEqual(step.teaching.conclusion);
      expect(hint.stages[2].description).not.toContain(hint.effect);
      expect(hint.proof.step.teaching).toEqual(step.teaching);
    });
});
