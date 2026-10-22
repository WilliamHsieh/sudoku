import { describe, it, expect } from "vitest";
import { newGame, setAnswer, toggleCandidate, hasCandidate } from "./game.js";
import { createHistory, commit, undo } from "./history.js";
import { createStroke, paintCell, strokeMarks, strokeResult, strokeAnnouncement } from "./paint.js";

/** @param {import("./game.js").NotesMode} [notesMode] */
const blank = (notesMode = "manual") => newGame("0".repeat(81), { notesMode });

describe.each(/** @type {import("./game.js").NotesMode[]} */ (["manual", "auto"]))(
  "%s paint",
  (mode) => {
    it("chooses a brush from the first empty cell and never reverses on revisits", () => {
      const before = blank(mode);
      const s = createStroke(before, 5);
      paintCell(s, 0);
      expect(s.brush).toBe(mode === "auto" ? "remove" : "add");
      const changed = s.state;
      paintCell(s, 0);
      expect(s.state).toBe(changed);
      paintCell(s, 1);
      expect(hasCandidate(s.state, 0, 5)).toBe(mode !== "auto");
      expect(hasCandidate(s.state, 1, 5)).toBe(mode !== "auto");
      expect(strokeMarks(s)[mode === "auto" ? "rem" : "add"]).toEqual(new Set([0, 1]));
    });

    it("sets mixed cells to the brush state and tints no-ops without marking them", () => {
      let before = blank(mode);
      before = toggleCandidate(before, 0, 5).state;
      const s = createStroke(before, 5);
      paintCell(s, 0);
      paintCell(s, 1);
      expect(hasCandidate(s.state, 0, 5)).toBe(mode === "auto");
      expect(hasCandidate(s.state, 1, 5)).toBe(mode === "auto");
      expect(strokeMarks(s).tint).toEqual(new Set([0, 1]));
      expect([...strokeMarks(s).add, ...strokeMarks(s).rem]).toEqual([0]);
    });

    it("skips givens and answers before choosing the brush", () => {
      let before = newGame("5" + "0".repeat(80), { notesMode: mode });
      before = setAnswer(before, 1, 3).state;
      const s = createStroke(before, 2);
      paintCell(s, 0);
      paintCell(s, 1);
      expect(s.brush).toBeNull();
      paintCell(s, 2);
      expect(s.touched).toEqual(new Set([2]));
      expect(s.state.givens).toBe(before.givens);
      expect(s.state.answers).toBe(before.answers);
    });

    it("refuses an illegal first add and ignores the rest of the stroke", () => {
      const before = newGame("5" + "0".repeat(80), { notesMode: mode });
      const s = createStroke(before, 5);
      paintCell(s, 1);
      paintCell(s, 40);
      expect(s.rejected).toBe(true);
      expect(s.blockers).toEqual([0]);
      expect(s.touched.size).toBe(0);
      expect(strokeResult(s)).toBe(before);
      expect(strokeAnnouncement(s)).toBe("");
    });

    it("refuses later illegal adds without tinting or marking them", () => {
      let before = newGame("5" + "0".repeat(80), { notesMode: mode });
      if (mode === "auto") before = toggleCandidate(before, 40, 5).state;
      const s = createStroke(before, 5);
      paintCell(s, 40);
      paintCell(s, 1);
      expect(s.brush).toBe("add");
      expect(s.refused).toEqual(new Set([1]));
      expect(s.touched).toEqual(new Set([40]));
      expect(strokeAnnouncement(s)).toBe("Added 5 to 1 cell; 1 cell refused");
    });

    it("commits one history entry and undo restores the entire stroke", () => {
      const before = blank(mode);
      const s = createStroke(before, 5);
      [0, 1, 2].forEach((i) => paintCell(s, i));
      const h = commit(createHistory(before), strokeResult(s));
      expect(h.past).toEqual([before]);
      expect(undo(h).present).toBe(before);
      expect(strokeAnnouncement(s)).toBe(
        mode === "auto" ? "Removed 5 from 3 cells" : "Added 5 to 3 cells"
      );
      // Discard uses the unmodified baseline; draft changes never mutate it.
      expect(s.before).toBe(before);
      expect(hasCandidate(before, 0, 5)).toBe(mode === "auto");
    });
  }
);

it("computes net marks against the baseline and returns it by identity for a net no-op", () => {
  const before = blank();
  const s = createStroke(before, 5);
  paintCell(s, 0);
  s.state = toggleCandidate(s.state, 0, 5).state;
  expect(strokeMarks(s).add.size).toBe(0);
  expect(strokeMarks(s).rem.size).toBe(0);
  expect(strokeAnnouncement(s)).toBe("");
  expect(strokeResult(s)).toBe(before);
  const h = createHistory(before);
  expect(commit(h, strokeResult(s))).toBe(h);
});

it("announces singular removal and plural refusals", () => {
  const s = createStroke(blank("auto"), 5);
  paintCell(s, 0);
  expect(strokeAnnouncement(s)).toBe("Removed 5 from 1 cell");
  s.refused = new Set([1, 2]);
  expect(strokeAnnouncement(s)).toBe("Removed 5 from 1 cell; 2 cells refused");
});
