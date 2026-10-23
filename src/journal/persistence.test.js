import { afterEach, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { journalPersisted, solvedPuzzles, puzzleProgress } from "./progress.js";
import { flushLocal } from "../persistence.js";

afterEach(() => vi.unstubAllGlobals());
it("requires both Journal stores to match disk before an automatic update", () => {
  solvedPuzzles.set({});
  puzzleProgress.set({});
  const values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key) => values.get(key) ?? null });
  expect(journalPersisted()).toBe(true);
  solvedPuzzles.set({ "2026-10-20": { easy: { completed: true, time: 42 } } });
  expect(journalPersisted()).toBe(false);
  values.set("sudoku-solved", JSON.stringify(get(solvedPuzzles)));
  expect(journalPersisted()).toBe(true);
  values.set("sudoku-progress", "corrupt");
  expect(journalPersisted()).toBe(false);
});
it("keeps a completed Journal record in memory when the disk is full, then retries it", () => {
  solvedPuzzles.set({});
  puzzleProgress.set({});
  vi.stubGlobal("window", {});
  const values = new Map();
  let full = true;
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw Error("quota");
      values.set(key, value);
    },
  });
  expect(() => solvedPuzzles.markSolved("2026-10-22", "hard", 456)).not.toThrow();
  expect(solvedPuzzles.isSolved("2026-10-22", "hard")).toBe(true);
  expect(flushLocal()).toBe(false);
  expect(journalPersisted()).toBe(false);
  full = false;
  expect(flushLocal()).toBe(true);
  expect(journalPersisted()).toBe(true);
});
