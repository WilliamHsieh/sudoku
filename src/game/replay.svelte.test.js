import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createGame } from "./game.svelte.js";
import { solvedPuzzles, puzzleProgress, replayProgress } from "../journal/progress.js";
import { timer, done } from "../store.js";
import { averages, personalBests } from "../journal/stats.js";
import { solvedModel } from "../solved.js";
const solution =
  "123456789456789123789123456234567891567891234891234567345678912678912345912345678";
const puzzle = "00" + solution.slice(2);
const dateStr = "2026-10-31";
const info = { dateStr, difficulty: "easy" };
let disk;
beforeEach(() => {
  disk = new Map();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => disk.set(key, value),
  });
  solvedPuzzles.set({});
  puzzleProgress.set({});
  replayProgress.set({});
  solvedPuzzles.markSolved(dateStr, "easy", 402);
});
afterEach(() => {
  done.set(false);
  vi.unstubAllGlobals();
});
it("derives an older solve without changing storage, selection or history", () => {
  const saved = disk.get("sudoku-solved");
  const g = createGame();
  g.load(puzzle, info);
  expect(g.solved).toBe(true);
  expect(g.journalView).toBe(true);
  expect(g.value(0)).toBe(1);
  expect(get(timer)).toBe(402);
  g.undo();
  g.fill(0, 9);
  g.select(0);
  expect(g.selected).toBe(-1);
  expect(g.canUndo).toBe(false);
  expect(disk.get("sudoku-solved")).toBe(saved);
});
it("keeps unfinished replay snapshots separate and leaves old stats intact on abandonment", () => {
  const saved = disk.get("sudoku-solved");
  const g = createGame();
  g.load(puzzle, info);
  g.startReplay();
  expect(get(timer)).toBe(0);
  expect(g.value(0)).toBe(0);
  g.fill(0, 1);
  timer.set(70);
  g.flushProgress();
  expect(JSON.parse(disk.get("sudoku-replay-progress"))[dateStr].easy.elapsed).toBe(70);
  expect(get(puzzleProgress)).toEqual({});
  g.load(puzzle, info);
  expect(g.journalView).toBe(true);
  expect(get(timer)).toBe(402);
  expect(averages(get(solvedPuzzles)).easy).toBe(402);
  expect(personalBests(get(solvedPuzzles)).easy.time).toBe(402);
  expect(disk.get("sudoku-solved")).toBe(saved);
  g.startReplay();
  expect(g.value(0)).toBe(0);
  expect(get(timer)).toBe(0);
});
it("writes exactly one replacement at completion and clears replay progress", () => {
  const g = createGame();
  g.load(puzzle, info);
  g.startReplay();
  const write = vi.spyOn(localStorage, "setItem");
  timer.set(330);
  g.fill(0, 1);
  g.fill(1, 2);
  expect(write.mock.calls.filter(([key]) => key === "sudoku-solved")).toHaveLength(1);
  expect(get(solvedPuzzles)[dateStr].easy.time).toBe(330);
  expect(averages(get(solvedPuzzles)).easy).toBe(330);
  expect(personalBests(get(solvedPuzzles)).easy.time).toBe(330);
  expect(get(replayProgress)).toEqual({});
  const model = solvedModel({
    date: dateStr,
    difficulty: "easy",
    time: 330,
    solved: get(solvedPuzzles),
    progress: {},
    puzzles: { [dateStr]: { easy: puzzle } },
    previousRecord: g.previousRecord,
  });
  expect(model.newBest).toBe(true);
  expect(model.delta).toBe(-72);
});

it("a slower replay replaces the old best and does not claim New best", () => {
  const g = createGame();
  g.load(puzzle, info);
  g.startReplay();
  timer.set(450);
  g.fill(0, 1);
  g.fill(1, 2);
  expect(personalBests(get(solvedPuzzles)).easy.time).toBe(450);
  const model = solvedModel({
    date: dateStr,
    difficulty: "easy",
    time: 450,
    solved: get(solvedPuzzles),
    progress: {},
    puzzles: { [dateStr]: { easy: puzzle } },
    previousRecord: g.previousRecord,
  });
  expect(model.newBest).toBe(false);
  expect(model.delta).toBe(48);
});
