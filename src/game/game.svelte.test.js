import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { createGame, DEMO_PUZZLE } from "./game.svelte.js";
import { done, puzzleProgress, timer, timerRunning } from "../store.js";
import { maskDigits } from "./board.js";

/** @type {ReturnType<typeof createGame>} */
let g;

beforeEach(() => {
  done.set(false);
  timer.set(0);
  timerRunning.set(true);
  g = createGame();
});

describe("createGame", () => {
  it("starts on the master demo puzzle, Auto notes, nothing selected", () => {
    expect(DEMO_PUZZLE).toBe(
      "050900000800040307000280190538607940020301000109804623907400000045000209000030070"
    );
    expect(g.selected).toBe(-1);
    expect(g.value(0)).toBe(0);
    expect(g.value(1)).toBe(5);
    expect(g.given(1)).toBe(true);
    expect(g.editable(0)).toBe(true);
    expect(maskDigits(g.notes(0))).toEqual([2, 3, 4, 6, 7]);
    expect(g.canUndo).toBe(false);
    expect(g.canRedo).toBe(false);
    expect(g.solved).toBe(false);
  });

  it("select, enter, same digit clears, 0 clears the answer only", () => {
    g.select(0);
    expect(g.selected).toBe(0);
    g.enter(0, 4);
    expect(g.value(0)).toBe(4);
    expect(g.canUndo).toBe(true);
    g.enter(0, 4);
    expect(g.value(0)).toBe(0);
    g.enter(0, 2);
    g.clearAnswer(0);
    expect(g.value(0)).toBe(0);
    g.clearAnswer(0);
    expect(g.canUndo).toBe(true); // no extra step
  });

  it("does not overwrite a given", () => {
    const r = g.enter(1, 7);
    expect(r.changed).toBe(false);
    expect(g.value(1)).toBe(5);
    expect(g.canUndo).toBe(false);
  });

  it("toggles Auto notes; illegal adds are refused with blockers", () => {
    expect(g.hasNote(0, 2)).toBe(true);
    g.toggleNote(0, 2);
    expect(g.hasNote(0, 2)).toBe(false);
    g.toggleNote(0, 2);
    expect(g.hasNote(0, 2)).toBe(true);
    const r = g.toggleNote(0, 5); // 5 is in the row
    expect(r.changed).toBe(false);
    expect(r.blockers).toContain(1);
    expect(g.blockers).toEqual(r.blockers);
  });

  it("undo / redo and a new edit clears redo", () => {
    g.enter(0, 4);
    g.toggleNote(2, 3); // hide a computed candidate
    expect(g.hasNote(2, 3)).toBe(false);
    g.undo();
    expect(g.value(0)).toBe(4);
    expect(g.hasNote(2, 3)).toBe(true);
    expect(g.canRedo).toBe(true);
    g.redo();
    expect(g.hasNote(2, 3)).toBe(false);
    g.undo();
    g.enter(0, 7);
    expect(g.canRedo).toBe(false);
    expect(g.value(0)).toBe(7);
  });

  it("load replaces the board, resets the timer and clears history", () => {
    g.enter(0, 4);
    timer.set(12);
    timerRunning.set(false);
    g.load("159230000800014700400500310060102578002083000980040006005000823700306005093000067", {
      dateStr: "2025-06-01",
      difficulty: "easy",
    });
    expect(g.value(0)).toBe(1);
    expect(g.given(0)).toBe(true);
    expect(g.selected).toBe(-1);
    expect(g.dateStr).toBe("2025-06-01");
    expect(g.difficulty).toBe("easy");
    expect(g.canUndo).toBe(false);
    expect(get(timer)).toBe(0);
    expect(get(timerRunning)).toBe(true);
    expect(get(done)).toBe(false);
  });

  it("persists in-progress answers and restores them with elapsed", () => {
    puzzleProgress.set({});
    g.load(DEMO_PUZZLE, { dateStr: "2026-10-18", difficulty: "medium" });
    g.enter(0, 4);
    timer.set(700);
    g.flushProgress();
    const saved = get(puzzleProgress)["2026-10-18"].medium;
    expect(saved.filled).toBe(1);
    expect(saved.elapsed).toBe(700);
    expect(saved.snapshot?.answers[0]).toBe("4");

    const g2 = createGame();
    g2.load(DEMO_PUZZLE, {
      dateStr: "2026-10-18",
      difficulty: "medium",
      snapshot: saved.snapshot,
      elapsed: saved.elapsed,
    });
    expect(g2.value(0)).toBe(4);
    expect(get(timer)).toBe(700);
  });

  it("clear on an answered cell drops the answer and restores hidden notes", () => {
    g.toggleNote(0, 2);
    g.enter(0, 4);
    expect(g.hasNote(0, 2)).toBe(false);
    g.clear(0);
    expect(g.value(0)).toBe(0);
    expect(g.hasNote(0, 2)).toBe(true);
  });

  it("setNotesMode is a view setting, not an undo step", () => {
    g.enter(0, 4);
    g.setNotesMode("manual");
    expect(g.notesMode).toBe("manual");
    expect(g.hasNote(0, 2)).toBe(false);
    g.undo();
    expect(g.notesMode).toBe("manual");
    expect(g.value(0)).toBe(0);
  });

  it("fillLone writes the lone Auto candidate as one step", () => {
    for (const d of [3, 4, 6, 7]) g.toggleNote(0, d);
    expect(g.noteCount(0)).toBe(1);
    g.fillLone(0);
    expect(g.value(0)).toBe(2);
    g.undo();
    expect(g.value(0)).toBe(0);
    expect(g.hasNote(0, 2)).toBe(true);
  });

  it("Erase is two-step in Auto: answer, then overrides", () => {
    g.toggleNote(0, 2);
    g.enter(0, 4);
    expect(g.eraseKind(0)).toBe("answer");
    g.erase(0);
    expect(g.value(0)).toBe(0);
    expect(g.hasNote(0, 2)).toBe(false);
    expect(g.eraseKind(0)).toBe("auto-overrides");
    g.erase(0);
    expect(g.hasNote(0, 2)).toBe(true);
    expect(g.eraseKind(0)).toBe(null);
  });

  it("restart clears answers, notes, history, selection and the timer", () => {
    g.select(0);
    g.enter(0, 4);
    g.toggleNote(2, 3);
    g.setNotesMode("manual");
    g.toggleNote(3, 1);
    timer.set(90);
    expect(g.canUndo).toBe(true);
    g.restart();
    expect(g.value(0)).toBe(0);
    expect(g.notesMode).toBe("manual");
    expect(g.hasNote(3, 1)).toBe(false);
    g.setNotesMode("auto");
    expect(g.hasNote(2, 3)).toBe(true);
    expect(g.canUndo).toBe(false);
    expect(g.canRedo).toBe(false);
    expect(g.selected).toBe(-1);
    expect(get(timer)).toBe(0);
    expect(get(timerRunning)).toBe(true);
    expect(get(done)).toBe(false);
  });

  it("peekUndo names the cell that changed", () => {
    expect(g.peekUndo()).toBe(null);
    g.enter(0, 4);
    const peek = g.peekUndo();
    expect(peek?.cells).toEqual([0]);
    expect(peek?.first).toBe(0);
  });
});
