import { describe, it, expect } from "vitest";
import { newGame, fillSingles, singleCandidates, candidates } from "./game.js";
import { ALL_DIGITS, bit } from "./board.js";

function fixture(singles) {
  const base = newGame("0".repeat(81), { notesMode: "auto" });
  const state = {
    ...base,
    autoRemoved: [...base.autoRemoved],
    autoAdded: [...base.autoAdded],
    manualNotes: [...base.manualNotes],
  };
  for (const [i, d] of singles) state.autoRemoved[i] = ALL_DIGITS & ~bit(d);
  return state;
}

describe("one-pass single-candidate fill", () => {
  it("places a shown single without changing the input", () => {
    const state = fixture([[0, 3]]);
    const result = fillSingles(state);
    expect(result.placed).toEqual([{ i: 0, d: 3 }]);
    expect(result.state.answers[0]).toBe(3);
    expect(state.answers[0]).toBe(0);
  });
  it.each([
    [0, 4],
    [0, 36],
    [0, 10],
  ])("skips all same-digit singles sharing a unit (%i, %i)", (a, b) => {
    const result = fillSingles(
      fixture([
        [a, 3],
        [b, 3],
        [80, 9],
      ])
    );
    expect(result.skipped).toEqual([a, b]);
    expect(result.placed).toEqual([{ i: 80, d: 9 }]);
  });
  it("keeps independent singles with the same digit", () => {
    expect(
      fillSingles(
        fixture([
          [0, 3],
          [40, 3],
        ])
      ).placed
    ).toHaveLength(2);
  });
  it("clears peer notes and added overrides, and does not loop", () => {
    const state = fixture([[0, 3]]);
    state.autoRemoved[1] = ALL_DIGITS & ~(bit(3) | bit(4));
    state.manualNotes[1] = bit(3) | bit(4);
    state.autoAdded[1] = bit(3);
    const result = fillSingles(state);
    expect(result.state.manualNotes[1]).toBe(bit(4));
    expect(result.state.autoAdded[1]).toBe(0);
    expect(candidates(result.state, 1)).toBe(bit(4));
    expect(result.state.answers[1]).toBe(0);
  });
  it("uses removed and added overrides in the shown mask", () => {
    const state = fixture([[0, 3]]);
    state.autoAdded[0] = bit(4);
    expect(singleCandidates(state)).toEqual([]);
    state.autoRemoved[0] = ALL_DIGITS;
    expect(fillSingles(state).placed).toEqual([{ i: 0, d: 4 }]);
  });
  it.each(/** @type {const} */ (["tidy", "manual"]))("does nothing in %s", (notesMode) => {
    const state = { ...fixture([[0, 3]]), notesMode };
    state.manualNotes[0] = bit(3);
    const result = fillSingles(state);
    expect(result.state).toBe(state);
    expect(result.changed).toBe(false);
    expect(result.placed).toEqual([]);
  });
  it("does not create a commit when all singles conflict", () => {
    const state = fixture([
      [0, 3],
      [1, 3],
    ]);
    expect(fillSingles(state).state).toBe(state);
  });
});
