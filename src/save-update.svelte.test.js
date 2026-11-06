import { afterEach, expect, it, vi } from "vitest";
import { createGame, DEMO_PUZZLE } from "./game/game.svelte.js";
import { puzzleProgress, customProgress } from "./journal/progress.js";
afterEach(() => vi.restoreAllMocks());
it.each([false, true])("Update must stop if the final %s save loses a cross-tab race", (custom) => {
  const store = custom ? customProgress : puzzleProgress;
  vi.spyOn(store, "isCurrent").mockReturnValue(true);
  vi.spyOn(store, "save").mockReturnValue(false);
  const game = createGame();
  game.load(DEMO_PUZZLE, custom ? { custom: true } : { dateStr: "2026-10-22", difficulty: "easy" });
  game.enter(0, 4);
  expect(() => game.flushProgress()).not.toThrow();
  expect(() => game.flushProgress(true)).toThrow(/another tab/);
});
it.each([false, true])("blocked storage keeps %s gameplay usable but prevents Update", (custom) => {
  vi.stubGlobal("window", {});
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("blocked getter");
    },
    setItem,
  });
  try {
    const game = createGame();
    game.load(
      DEMO_PUZZLE,
      custom ? { custom: true } : { dateStr: "2026-10-22", difficulty: "easy" }
    );
    expect(() => game.enter(0, 4)).not.toThrow();
    expect(game.state.answers[0]).toBe(4);
    expect(() => game.flushProgress()).not.toThrow();
    expect(() => game.flushProgress(true)).toThrow();
    expect(setItem).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("does not clear progress or allow Update when the solved-record read is blocked", () => {
  const solution =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
  puzzleProgress.set({});
  const data = new Map();
  let blockSolved = true;
  const setItem = vi.fn((key, value) => data.set(key, value));
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key) => {
      if (key === "sudoku-solved" && blockSolved) throw Error("blocked solved read");
      return data.get(key) ?? null;
    },
    setItem,
  });
  try {
    const game = createGame();
    game.load(`00${solution.slice(2)}`, { dateStr: "day", difficulty: "easy" });
    game.enter(0, 5);
    const saved = data.get("sudoku-progress");
    setItem.mockClear();
    expect(() => game.enter(1, 3)).not.toThrow();
    expect(data.get("sudoku-progress")).toBe(saved);
    expect(setItem).not.toHaveBeenCalled();
    expect(() => game.flushProgress(true)).toThrow();
    blockSolved = false;
    expect(() => game.flushProgress(true)).not.toThrow();
    expect(JSON.parse(data.get("sudoku-solved")).day.easy.completed).toBe(true);
    expect(JSON.parse(data.get("sudoku-progress"))).toEqual({});
  } finally {
    vi.unstubAllGlobals();
  }
});
