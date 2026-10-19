import { describe, it, expect } from "vitest";
import { newGame, setAnswer, toggleCandidate, erase, setNotesMode, valueAt, fill } from "./game.js";
import {
  createHistory,
  commit,
  replace,
  undo,
  redo,
  canUndo,
  canRedo,
  changedCells,
} from "./history.js";
import { PUZZLE, EMPTY, notes } from "./test-fixtures.js";

const start = (notesMode = "manual") =>
  createHistory(newGame(PUZZLE, { notesMode: /** @type {any} */ (notesMode) }));
/** @param {import('./history.js').History} h @param {Function} fn */
const act = (h, fn, ...args) => commit(h, fn(h.present, ...args));

describe("undo / redo", () => {
  it("starts with nothing to undo or redo", () => {
    const h = start();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("one step per action: undo reverts answers and candidates in order", () => {
    let h = start();
    h = act(h, setAnswer, EMPTY, 4);
    h = act(h, setAnswer, EMPTY, 4); // clears
    h = act(h, toggleCandidate, EMPTY, 9);
    expect(notes(h.present, EMPTY)).toBe("9");
    h = undo(h);
    expect(notes(h.present, EMPTY)).toBe("");
    expect(valueAt(h.present, EMPTY)).toBe(0);
    h = undo(h);
    expect(valueAt(h.present, EMPTY)).toBe(4);
    h = undo(h);
    expect(valueAt(h.present, EMPTY)).toBe(0);
    expect(canUndo(h)).toBe(false);
  });

  it("actions that change nothing add no step (refusals, no-op erase, given cells, no fill)", () => {
    let h = start();
    for (const r of [
      toggleCandidate(h.present, EMPTY, 4),
      erase(h.present, EMPTY),
      setAnswer(h.present, 0, 5),
      fill(h.present, EMPTY),
    ]) {
      h = commit(h, r);
    }
    expect(canUndo(h)).toBe(false);
  });

  it("redo restores in order; a new edit clears the redo stack", () => {
    let h = start();
    h = act(h, setAnswer, EMPTY, 4);
    h = act(h, toggleCandidate, 5, 1);
    h = undo(undo(h));
    expect(valueAt(h.present, EMPTY)).toBe(0);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(valueAt(h.present, EMPTY)).toBe(4);
    h = redo(h);
    expect(notes(h.present, 5)).toBe("1");
    expect(canRedo(h)).toBe(false);

    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = act(h, toggleCandidate, EMPTY, 9); // EMPTY holds 4, so this is refused: no step, redo kept
    expect(canRedo(h)).toBe(true);
    h = act(h, setAnswer, EMPTY, 1);
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
  });

  it("Erase on a cell with only stale Auto overrides adds no step", () => {
    let h = start("auto");
    h = act(h, toggleCandidate, EMPTY, 3);
    h = act(h, setAnswer, 76, 3);
    const steps = h.past.length;
    h = act(h, erase, EMPTY);
    expect(h.past.length).toBe(steps);
    h = undo(h);
    expect(valueAt(h.present, 76)).toBe(0);
  });

  it("each Erase is one step", () => {
    let h = start();
    h = act(h, toggleCandidate, EMPTY, 1);
    h = act(h, setAnswer, EMPTY, 4);
    h = act(h, erase, EMPTY);
    h = act(h, erase, EMPTY);
    expect(notes(h.present, EMPTY)).toBe("");
    h = undo(h);
    expect(notes(h.present, EMPTY)).toBe("1");
    expect(valueAt(h.present, EMPTY)).toBe(0);
    h = undo(h);
    expect(valueAt(h.present, EMPTY)).toBe(4);
  });

  it("five undos then five redos land back on the same state", () => {
    let h = start("auto");
    for (const d of [1, 3, 7, 9]) h = act(h, toggleCandidate, EMPTY, d);
    h = act(h, setAnswer, 55, 9);
    const end = h.present;
    for (let k = 0; k < 5; k++) h = undo(h);
    expect(notes(h.present, EMPTY)).toBe("1379");
    expect(valueAt(h.present, 55)).toBe(0);
    for (let k = 0; k < 5; k++) h = redo(h);
    expect(h.present).toEqual(end);
  });

  it("switching notes mode is not a step, and undo/redo keep the current mode", () => {
    let h = start();
    h = act(h, toggleCandidate, EMPTY, 7);
    h = replace(h, setNotesMode(h.present, "auto"));
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present.notesMode).toBe("auto");
    expect(notes(h.present, EMPTY)).toBe("1379");
    h = redo(h);
    expect(h.present.notesMode).toBe("auto");
    expect(notes(setNotesMode(h.present, "manual"), EMPTY)).toBe("7");
    expect(replace(h, h.present)).toBe(h);
  });

  it("keeps at most `limit` steps", () => {
    let h = createHistory(newGame(PUZZLE), { limit: 3 });
    for (const d of [1, 3, 7, 9, 1]) h = act(h, setAnswer, EMPTY, d);
    expect(h.past).toHaveLength(3);
    h = undo(undo(undo(h)));
    expect(canUndo(h)).toBe(false);
    expect(valueAt(h.present, EMPTY)).toBe(3);
  });

  it("commit accepts a state as well as an action result", () => {
    const h = start();
    const next = setAnswer(h.present, EMPTY, 3).state;
    expect(commit(h, next).present).toBe(next);
    expect(commit(h, h.present)).toBe(h);
  });
});

describe("changedCells", () => {
  it("lists cells whose answer or notes differ", () => {
    let h = start("auto");
    h = act(h, setAnswer, EMPTY, 7);
    h = act(h, toggleCandidate, 36, 1);
    expect(changedCells(h.past[0], h.present)).toEqual([36, EMPTY]);
    expect(changedCells(h.present, h.present)).toEqual([]);
    // A mode switch changes no cell data.
    expect(changedCells(h.present, setNotesMode(h.present, "manual"))).toEqual([]);
  });
});
