import { describe, expect, it } from "vitest";
import { createGame, DEMO_PUZZLE } from "./game.svelte.js";
import { candidates, conflicts, newGame } from "./game.js";
import { bit, popcount } from "./board.js";
import { createStroke, paintCell, strokeResult } from "./paint.js";
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
    return seed % limit;
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

  const cases = ["auto", "tidy", "manual"].flatMap((mode) =>
    Array.from({ length: 40 }, (_, i) => ({ mode, seed: i + 1 }))
  );
  it.each(cases)(
    "matches fresh conflicts through edits and strokes: $mode, seed $seed",
    ({ mode, seed }) => {
      const next = random(seed);
      const game = createGame();
      game.load(seed % 2 ? DEMO_PUZZLE : "0".repeat(81));
      game.setNotesMode(/** @type {import('./game.js').NotesMode} */ (mode));
      expectConflicts(game);
      for (let step = 0; step < 6; step++) {
        const i = next(81);
        const d = next(9) + 1;
        switch (next(6)) {
          case 0:
            game.enter(i, d);
            break;
          case 1:
            game.toggleNote(i, d);
            break;
          case 2:
            game.clear(i);
            break;
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
              paintCell(stroke, next(81));
              game.previewStroke(stroke.state);
              expectConflicts(game);
            }
            if (next(2)) {
              game.commitStroke(strokeResult(stroke));
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
        }
        expectConflicts(game);
      }
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
