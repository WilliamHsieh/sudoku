import { describe, expect, it } from "vitest";
import { createGame, DEMO_PUZZLE } from "./game.svelte.js";
import { candidates, conflicts, newGame } from "./game.js";
import { ALL_DIGITS, bit, popcount } from "./board.js";
import { createStroke, paintCell, strokeResult } from "./paint.js";
import { toSnapshot } from "./snapshot.js";
import { changedCells } from "./history.js";
import { PUZZLE, solve } from "./test-fixtures.js";

/** @param {ReturnType<typeof createGame>} game */
function expectConflicts(game) {
  const fresh = conflicts(game.state);
  const expected = Array.from({ length: 81 }, (_, i) => fresh.has(i));
  expect(Array.from({ length: 81 }, (_, i) => game.inConflict(i))).toEqual(expected);
  expect(game.inConflict(0)).toBe(expected[0]);
  expect(game.inConflict(80)).toBe(expected[80]);
  const masks = Array.from({ length: 81 }, (_, i) => candidates(game.state, i));
  expect(Array.from({ length: 81 }, (_, i) => game.notes(i))).toEqual(masks);
  expect(game.noteCount(0)).toBe(popcount(masks[0]));
  for (let d = 1; d <= 9; d++) {
    expect(game.hasNote(0, d)).toBe((masks[0] & bit(d)) !== 0);
  }
}

/** Reproducible random operations. @param {number} seed */
function random(seed) {
  return (limit) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    // Use high bits: the low bit of this LCG alternates on every draw.
    return Math.floor((seed / 0x100000000) * limit);
  };
}

describe("reactive conflict set", () => {
  it("matches fresh conflicts for fixtures, replacements, and restored previews", () => {
    const game = createGame();
    const solved = solve(newGame(PUZZLE)).join("");
    for (const puzzle of [DEMO_PUZZLE, PUZZLE, "0".repeat(81), "1".repeat(81), solved]) {
      game.load(puzzle);
      expectConflicts(game);
      const before = game.state;
      const draft = { ...before, answers: before.answers.map((_, i) => (i % 9) + 1) };
      game.previewStroke(draft);
      expectConflicts(game);
      // A second replacement can remove conflicts as well as add them.
      game.previewStroke(newGame("0".repeat(81)));
      expectConflicts(game);
      game.previewStroke(null);
      expect(game.state).toBe(before);
      expectConflicts(game);
      game.restart();
      expectConflicts(game);
    }
  });

  const modes = /** @type {const} */ (["auto", "tidy", "manual"]);
  const removalActions = /** @type {const} */ (["erase", "clear", "clearAnswer", "restart"]);
  for (const mode of modes) {
    it.each(removalActions)(
      `refreshes conflicts after %s removes a duplicate (${mode})`,
      (action) => {
        const game = createGame();
        game.load("0".repeat(81));
        game.setNotesMode(mode);
        game.enter(0, 1);
        game.enter(1, 1);
        expectConflicts(game); // Read both caches before the writer under test.
        expect(game.inConflict(0)).toBe(true);
        const before = game.state;
        game[action](1);
        expect(changedCells(before, game.state).length).toBeGreaterThan(0);
        expect(game.inConflict(0)).toBe(false);
        expectConflicts(game);
        if (action !== "restart") {
          game.undo();
          expectConflicts(game);
          expect(game.inConflict(0)).toBe(true);
          game.redo();
          expectConflicts(game);
          expect(game.inConflict(0)).toBe(false);
        }
      }
    );

    it.each(["fill", "fillLone"])(
      `refreshes conflicts after %s creates a duplicate (${mode})`,
      (action) => {
        const game = createGame();
        game.load("0".repeat(81));
        game.setNotesMode(mode);
        game.enter(0, 1);
        expectConflicts(game);
        expect(game.inConflict(0)).toBe(false);
        if (action === "fill") game.fill(1, 1);
        else game.fillLone(1, 1);
        expect(game.value(1)).toBe(1);
        expect(game.inConflict(0)).toBe(true);
        expectConflicts(game);
        game.undo();
        expectConflicts(game);
        game.redo();
        expectConflicts(game);
      }
    );

    it(`refreshes merged notes and their single undo step (${mode})`, () => {
      const game = createGame();
      game.load("0".repeat(81));
      game.setNotesMode(mode);
      game.toggleNote(0, 2);
      expectConflicts(game);
      const before = game.notes(1);
      expect(game.toggleNote(1, 2, { merge: true }).changed).toBe(true);
      expect(game.notes(1)).not.toBe(before);
      expectConflicts(game);
      game.undo();
      expectConflicts(game);
      expect(game.canUndo).toBe(false);
      game.redo();
      expectConflicts(game);
    });

    it(`refreshes snapshot restore, including conflicts and notes (${mode})`, () => {
      const game = createGame();
      game.load("0".repeat(81));
      game.setNotesMode(mode);
      game.enter(0, 1);
      game.enter(1, 1);
      game.toggleNote(40, 2);
      const snapshot = toSnapshot(game.state);
      game.restart();
      expectConflicts(game);
      expect(game.inConflict(0)).toBe(false);
      game.load(snapshot.puzzle, { snapshot });
      expect(toSnapshot(game.state)).toEqual(snapshot);
      expect(game.inConflict(0)).toBe(true);
      expectConflicts(game);
    });

    it(`refreshes a stroke committed without a prior preview (${mode})`, () => {
      const game = createGame();
      game.load("0".repeat(81));
      game.setNotesMode(mode);
      const before = game.beginStroke();
      const stroke = createStroke(before, 2);
      for (const i of [0, 1, 2, 9, 10, 11, 18, 19, 20, 30, 40, 50]) paintCell(stroke, i);
      const next = strokeResult(stroke);
      expect(next).not.toBe(before);
      expectConflicts(game);
      expect(game.commitStroke(next).changed).toBe(true);
      expectConflicts(game);
      game.undo();
      expectConflicts(game);
      expect(game.state).toEqual(before);
      game.redo();
      expectConflicts(game);
      expect(game.state).toEqual(next);
    });

    it.each(["beginStroke", "select"])(
      `refreshes when %s cancels a conflicting draft (${mode})`,
      (action) => {
        const game = createGame();
        game.load("0".repeat(81));
        game.setNotesMode(mode);
        const before = game.state;
        const answers = [...before.answers];
        answers[0] = answers[1] = 1;
        game.previewStroke({ ...before, answers });
        expectConflicts(game);
        expect(game.inConflict(0)).toBe(true);
        if (action === "select") game.select(40);
        else expect(game.beginStroke()).toBe(before);
        expect(game.state).toBe(before);
        expect(game.inConflict(0)).toBe(false);
        expectConflicts(game);
      }
    );
  }

  it("refreshes after filling a lone Auto override that creates a conflict", () => {
    const state = newGame("0".repeat(81), { notesMode: "auto" });
    const answers = [...state.answers];
    answers[0] = 1;
    const autoAdded = [...state.autoAdded];
    const autoRemoved = [...state.autoRemoved];
    autoAdded[1] = bit(1);
    autoRemoved[1] = ALL_DIGITS & ~bit(1);
    const snapshot = toSnapshot({ ...state, answers, autoAdded, autoRemoved });
    const game = createGame();
    game.load(snapshot.puzzle, { snapshot });
    expectConflicts(game);
    expect(game.noteCount(1)).toBe(1);
    expect(game.fillLone(1).changed).toBe(true);
    expect(game.value(1)).toBe(1);
    expect(game.inConflict(0)).toBe(true);
    expectConflicts(game);
  });

  const cases = ["auto", "tidy", "manual"].flatMap((mode) =>
    Array.from({ length: 40 }, (_, i) => ({ mode, seed: i + 1 }))
  );
  it.each(cases)(
    "matches fresh conflicts through edits and strokes: $mode, seed $seed",
    ({ mode, seed }) => {
      const next = random(seed);
      const game = createGame();
      game.load("0".repeat(81));
      game.setNotesMode(/** @type {import('./game.js').NotesMode} */ (mode));
      expectConflicts(game);
      const counts = { commits: 0, clears: 0, restarts: 0 };
      for (let step = 0; step < 18; step++) {
        const i = next(81);
        const d = next(9) + 1;
        // The prefix guarantees effective operations; the rest varies by seed.
        const operation = step < 3 ? [2, 7, 5][step] : next(8);
        switch (operation) {
          case 0:
            game.enter(i, d);
            break;
          case 1:
            game.toggleNote(i, d);
            break;
          case 2: {
            if (!game.state.answers[i]) game.enter(i, d);
            expectConflicts(game);
            const before = game.state;
            game.clear(i);
            if (changedCells(before, game.state).length) counts.clears++;
            break;
          }
          case 3:
            game.undo();
            break;
          case 4:
            game.redo();
            break;
          case 5: {
            const before = game.beginStroke();
            const stroke = createStroke(before, d);
            for (let entry = 0; entry < 12; entry++) {
              paintCell(stroke, entry === 0 ? i : next(81));
              game.previewStroke(stroke.state);
              expectConflicts(game);
            }
            if (next(2) || step === 2) {
              if (game.commitStroke(strokeResult(stroke)).changed) counts.commits++;
              expectConflicts(game);
              game.undo();
              expectConflicts(game);
              game.redo();
            } else {
              game.previewStroke(null);
              expect(game.state).toBe(before);
            }
            break;
          }
          case 6:
            game.fill(i, d);
            break;
          case 7: {
            if (!game.state.answers.some(Boolean)) game.enter(i, d);
            expectConflicts(game);
            const before = game.state;
            game.restart();
            if (changedCells(before, game.state).length) counts.restarts++;
            break;
          }
        }
        expectConflicts(game);
      }
      expect(counts.commits).toBeGreaterThan(0);
      expect(counts.clears).toBeGreaterThan(0);
      expect(counts.restarts).toBeGreaterThan(0);
      while (game.canUndo) {
        game.undo();
        expectConflicts(game);
      }
      while (game.canRedo) {
        game.redo();
        expectConflicts(game);
      }
    }
  );
});
