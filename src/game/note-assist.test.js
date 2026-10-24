import { describe, it, expect } from "vitest";
import {
  newGame,
  candidates,
  setAnswer,
  toggleCandidate,
  setNotesMode,
  erase,
  clearCell,
  fill,
} from "./game.js";
import { PEERS, bit, ALL_DIGITS } from "./board.js";
import { createHistory, commit, replace, undo, redo, changedCells } from "./history.js";
import { fromSnapshot, toSnapshot } from "./snapshot.js";

const blank = (notesMode) => newGame("0".repeat(81), { notesMode });
const seeded = (mode) => ({ ...blank(mode), manualNotes: Array(81).fill(bit(3) | bit(5)) });

describe("note assist modes", () => {
  it("Auto recomputes, Tidy clears only peer notes, Manual leaves notes alone", () => {
    for (const mode of ["auto", "tidy", "manual"]) {
      const before = seeded(mode);
      const after = setAnswer(before, 44, 3).state;
      for (let i = 0; i < 81; i++) {
        const peer = PEERS[44].includes(i);
        expect(after.manualNotes[i]).toBe(mode === "tidy" && peer ? bit(5) : bit(3) | bit(5));
        expect(candidates(after, i)).toBe(
          i === 44 ? 0 : mode === "auto" ? ALL_DIGITS & ~(peer ? bit(3) : 0) : after.manualNotes[i]
        );
      }
      expect(before.manualNotes.every((mask) => mask === (bit(3) | bit(5)))).toBe(true);
    }
  });

  it("cleanup and answer are one history step; undo rings include every changed peer", () => {
    const before = seeded("tidy");
    const h = commit(createHistory(before), setAnswer(before, 44, 3));
    expect(h.past).toHaveLength(1);
    expect(changedCells(h.present, before)).toEqual([...PEERS[44], 44].sort((a, b) => a - b));
    expect(undo(h).present).toEqual(before);
    expect(redo(undo(h)).present).toEqual(h.present);
  });

  it("Erase, repeated digit and right-click never restore cleaned notes", () => {
    const placed = setAnswer(seeded("tidy"), 44, 3).state;
    for (const result of [erase(placed, 44), setAnswer(placed, 44, 3), clearCell(placed, 44)]) {
      expect(result.state.answers[44]).toBe(0);
      expect(result.state.manualNotes).toEqual(placed.manualNotes);
    }
  });

  it("Tidy edits and double-tap fill use manual notes and the same cleanup action", () => {
    const state = toggleCandidate(blank("tidy"), 0, 3).state;
    expect(candidates(state, 0)).toBe(bit(3));
    expect(state.autoAdded.every((v) => v === 0)).toBe(true);
    expect(fill(state, 1).changed).toBe(false);
    expect(fill(state, 1, 3).state.manualNotes[0]).toBe(0);
  });

  it("all mode switches preserve both note sets and undo/redo keep the current mode", () => {
    const before = { ...seeded("manual"), autoRemoved: Array(81).fill(bit(2)) };
    let h = commit(createHistory(before), setAnswer(before, 44, 3));
    for (const mode of /** @type {const} */ (["auto", "tidy", "manual", "tidy", "auto"])) {
      const next = setNotesMode(h.present, mode);
      expect(next.manualNotes).toBe(h.present.manualNotes);
      expect(next.autoRemoved).toBe(h.present.autoRemoved);
      h = replace(h, next);
      expect(h.past).toHaveLength(1);
      expect(undo(h).present.notesMode).toBe(mode);
      expect(redo(undo(h)).present.notesMode).toBe(mode);
    }
  });

  it.each(["auto", "tidy", "manual"])("round trips a %s save", (mode) => {
    const state = seeded(mode);
    expect(fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))))).toEqual(state);
  });

  it.each([
    [{ notesMode: "manual" }, "manual"],
    [{ notesMode: "auto" }, "auto"],
    [{ notesMode: true }, "auto"],
    [{ notesMode: false }, "manual"],
    [{ auto: true }, "auto"],
    [{ auto: false }, "manual"],
    [{}, "auto"],
    [{ notesMode: "unknown" }, "auto"],
  ])("loads old saves %j as %s", (legacy, mode) => {
    const snapshot = toSnapshot(seeded("auto"));
    delete snapshot.notesMode;
    expect(fromSnapshot({ ...snapshot, ...legacy }).notesMode).toBe(mode);
  });
});
