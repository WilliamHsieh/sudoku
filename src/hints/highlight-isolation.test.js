import { afterEach, describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Cell from "../Cell.svelte";
import { game } from "../game/game.svelte.js";
import { padUi } from "../pad-ui.svelte.js";
import { setAnswer } from "../game/game.js";
import { resetKeypad } from "../keypad-actions.js";

const puzzle = "050900000800040307000280190538607940020301000109804623907400000045000209000030070";
const evidence = {
  observe: true,
  premise: true,
  target: false,
  candidates: [1],
  excluded: [],
  eliminations: [2],
  mask: 1022,
};
const html = (cell_id, props = {}) => render(Cell, { props: { cell_id, ...props } }).body;

afterEach(() => {
  resetKeypad();
  padUi.blocked = [];
  padUi.undoTargets = [];
});

describe("hint highlight isolation", () => {
  it("suppresses ordinary cell/notes feedback on related AND unrelated cells without changing data", () => {
    game.load(puzzle);
    game.select(0);
    padUi.shown = 5;
    padUi.blocking = [0];
    padUi.blocked = [0];
    padUi.undoTargets = [0];
    const state = game.state;
    const selection = game.selected;
    const notes = game.notes(0);
    const normal = html(0);
    expect(normal).toMatch(/class="cell[^"]*selected/);
    expect(normal).toMatch(/class="cell[^"]*blocking/);
    for (const hint of [null, evidence]) {
      const isolated = html(0, { suppressHighlights: true, hint });
      expect(isolated).not.toMatch(
        /class="cell[^"]*\b(?:selected|same|conflict|blocking|blocked|undo-target|paint-add|paint-remove|finger-add)\b/
      );
      expect(isolated).not.toMatch(
        /class="pencil-box[^"]*\b(?:selected|matching-number|aim|cue|ghost|preview-add|paint-added)\b/
      );
      expect(isolated).toContain(
        `data-notes="${String(notes).length ? [...Array(9)].map((_, i) => (notes & (1 << (i + 1)) ? i + 1 : "")).join("") : ""}"`
      );
      if (hint) {
        expect(isolated).toContain("hint-observe");
        expect(isolated).toContain("hint-premise");
        expect(isolated).toContain("hint-elimination");
      }
    }
    expect(game.state).toBe(state);
    expect(game.selected).toBe(selection);
    expect(game.notes(0)).toBe(notes);
    expect(html(0)).toMatch(/class="cell[^"]*selected/);
  });
  it("suppresses both conflict backgrounds and the separate filled-digit conflict marker", () => {
    game.load(puzzle);
    game.commitStroke(setAnswer(game.state, 0, 5).state);
    expect(html(0)).toMatch(/class="conflict\b/);
    const state = game.state;
    expect(html(0, { suppressHighlights: true })).not.toMatch(/class="conflict\b/);
    expect(game.state).toBe(state);
    expect(game.value(0)).toBe(5);
  });
  it("coordinate focus has its own repeatable reduced-motion ring without selecting", () => {
    game.load(puzzle);
    game.select(2);
    const focused = html(44, { hintFocus: 2, reducedMotion: true });
    expect(focused).toContain("hint-focus");
    expect(focused).toContain("hint-focus-alternate");
    expect(focused).toContain("hint-focus-reduced");
    expect(game.selected).toBe(2);
    expect(html(44)).not.toContain("hint-focus ");
  });
});
