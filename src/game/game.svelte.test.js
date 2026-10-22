import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { createGame, DEMO_PUZZLE } from "./game.svelte.js";
import { done, puzzleProgress, timer, timerRunning } from "../store.js";
import { maskDigits } from "./board.js";
import { createPlay } from "../play/session.svelte.js";

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

describe("cue idle clock", () => {
  /** @type {number} */
  let n;

  beforeEach(() => {
    n = 0;
    g.setOnActivity(() => {
      n += 1;
    });
  });

  it("does not restart for selection", () => {
    g.select(0);
    g.select(10);
    g.select(-1);
    expect(g.selected).toBe(-1);
    expect(n).toBe(0);
  });

  it("does not restart when an attempt changes nothing", () => {
    expect(g.enter(1, 7).changed).toBe(false);
    expect(g.fill(1, 3).changed).toBe(false);
    expect(g.erase(0).changed).toBe(false);
    expect(g.clear(0).changed).toBe(false);
    expect(g.clearAnswer(0).changed).toBe(false);
    expect(g.fillLone(0).changed).toBe(false);
    const refused = g.toggleNote(0, 5);
    expect(refused.changed).toBe(false);
    expect(refused.blockers.length).toBeGreaterThan(0);
    g.undo();
    g.redo();
    g.setNotesMode("auto");
    g.restart();
    expect(g.value(1)).toBe(5);
    expect(n).toBe(0);
  });

  it("restarts when an answer, note, or erase changes the board", () => {
    g.enter(0, 4);
    expect(g.value(0)).toBe(4);
    expect(n).toBe(1);
    g.fill(0, 4);
    expect(n).toBe(1);
    g.fill(0, 7);
    expect(n).toBe(2);
    g.clearAnswer(0);
    expect(g.value(0)).toBe(0);
    expect(n).toBe(3);
    g.enter(0, 4);
    g.erase(0);
    expect(g.value(0)).toBe(0);
    expect(n).toBe(5);
    g.clear(0);
    expect(n).toBe(5);

    g.toggleNote(0, 2);
    expect(g.hasNote(0, 2)).toBe(false);
    expect(n).toBe(6);
    g.toggleNote(0, 2);
    expect(n).toBe(7);
    g.toggleNote(0, 3);
    g.erase(0);
    expect(g.hasNote(0, 3)).toBe(true);
    expect(n).toBe(9);

    g.enter(0, 4);
    g.clear(0);
    expect(g.value(0)).toBe(0);
    expect(n).toBe(11);
  });

  it("folds a merged note toggle into the same undo step and still counts as activity", () => {
    g.toggleNote(0, 2);
    g.toggleNote(0, 3, { merge: true });
    expect(g.hasNote(0, 2)).toBe(false);
    expect(g.hasNote(0, 3)).toBe(false);
    expect(n).toBe(2);
    g.undo();
    expect(g.hasNote(0, 2)).toBe(true);
    expect(g.hasNote(0, 3)).toBe(true);
    expect(g.canUndo).toBe(false);
    expect(n).toBe(3);
  });

  it("restarts for fillLone and for undo or redo that change state", () => {
    for (const d of [3, 4, 6, 7]) g.toggleNote(0, d);
    expect(g.noteCount(0)).toBe(1);
    expect(n).toBe(4);
    g.fillLone(0);
    expect(g.value(0)).toBe(2);
    expect(n).toBe(5);
    g.fillLone(0);
    expect(n).toBe(5);
    g.undo();
    expect(g.value(0)).toBe(0);
    expect(n).toBe(6);
    g.redo();
    expect(g.value(0)).toBe(2);
    expect(n).toBe(7);
    g.undo();
    g.redo();
    expect(n).toBe(9);
    g.redo();
    expect(n).toBe(9);
  });

  it("restarts when Notes mode switches, including a manual note edit", () => {
    g.setNotesMode("manual");
    expect(g.notesMode).toBe("manual");
    expect(n).toBe(1);
    g.setNotesMode("manual");
    expect(n).toBe(1);
    g.toggleNote(0, 2);
    expect(g.hasNote(0, 2)).toBe(true);
    expect(n).toBe(2);
    g.toggleNote(0, 2);
    expect(g.hasNote(0, 2)).toBe(false);
    expect(n).toBe(3);
    g.toggleNote(0, 5);
    expect(g.hasNote(0, 5)).toBe(false);
    expect(n).toBe(3);
    g.setNotesMode("auto");
    expect(n).toBe(4);
  });

  it("restarts when restart clears progress and not when the board is already clear", () => {
    g.restart();
    expect(n).toBe(0);
    g.enter(0, 4);
    g.toggleNote(2, 3);
    g.restart();
    expect(g.value(0)).toBe(0);
    expect(g.hasNote(2, 3)).toBe(true);
    expect(n).toBe(3);
    g.restart();
    expect(n).toBe(3);
  });

  it("selection does not delay the cue; a board change does; a no-op does not", () => {
    let time = 0;
    const play = createPlay({ live: false, idleMs: 30_000, now: () => time });
    play.bindLones(() => [2]);
    g.setOnActivity(() => play.noteActivity());
    play.start();

    time = 20_000;
    g.select(0);
    g.select(-1);
    g.enter(1, 7);
    g.erase(0);
    g.undo();
    g.redo();
    play.step();
    expect(play.phase).toBe("idle");
    time = 30_000;
    play.step();
    expect(play.phase).toBe("flash");
    expect(play.showsCue(2)).toBe(true);

    time = 31_000;
    g.select(0);
    g.enter(0, 4);
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);
    time = 60_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 61_000;
    play.step();
    expect(play.phase).toBe("flash");

    time = 70_000;
    g.fill(0, 4);
    g.enter(1, 9);
    g.erase(2);
    g.setNotesMode("auto");
    play.step();
    expect(play.phase).toBe("idle");
    time = 90_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 91_000;
    play.step();
    expect(play.phase).toBe("flash");

    time = 92_000;
    g.setNotesMode("manual");
    expect(play.phase).toBe("idle");
    time = 121_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 122_000;
    play.step();
    expect(play.phase).toBe("flash");
  });
});

describe("paint draft transactions", () => {
  it("previews without history, discards exactly, and commits one step without merging an earlier edit", async () => {
    const { createStroke, paintCell, strokeResult } = await import("./paint.js");
    g.enter(2, 4);
    const before = g.state;
    const s = createStroke(before, 2);
    paintCell(s, 0);
    paintCell(s, 5);
    g.previewStroke(s.state);
    expect(g.hasNote(0, 2)).toBe(false);
    g.previewStroke(null);
    expect(g.state).toBe(before);
    g.previewStroke(s.state);
    g.commitStroke(strokeResult(s));
    g.undo();
    expect(g.state).toBe(before);
    expect(g.value(2)).toBe(4);
    g.undo();
    expect(g.value(2)).toBe(0);
  });

  it("adds no history for an unchanged draft", () => {
    const before = g.state;
    g.previewStroke(before);
    g.commitStroke(before);
    expect(g.canUndo).toBe(false);
  });
});

it("persists progress once per stroke and never saves a draft or discard", async () => {
  const { vi } = await import("vitest");
  const { createStroke, paintCell, strokeResult } = await import("./paint.js");
  g.load(DEMO_PUZZLE, { dateStr: "2026-10-22", difficulty: "easy" });
  timer.set(12);
  const save = vi.spyOn(puzzleProgress, "save");
  const s = createStroke(g.state, 2);
  paintCell(s, 0);
  g.previewStroke(s.state);
  paintCell(s, 2);
  g.previewStroke(s.state);
  expect(save).not.toHaveBeenCalled();
  g.previewStroke(null);
  expect(save).not.toHaveBeenCalled();
  g.previewStroke(s.state);
  g.commitStroke(strokeResult(s));
  expect(save).toHaveBeenCalledTimes(1);
  save.mockRestore();
});
