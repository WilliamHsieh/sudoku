import { afterEach, expect, it, vi } from "vitest";
import { puzzleProgress, customProgress, solvedPuzzles } from "./progress.js";

afterEach(() => vi.unstubAllGlobals());
for (const fault of [
  "blocked",
  "invalid JSON",
  "null",
  "[]",
  '{"other":null}',
  '{"other":{"hard":{"snapshot":{}}}}',
]) {
  it.each(["save", "clear", "markSolved", "isCurrent", "custom save"])(
    `%s fails closed before writes when storage contains ${fault}`,
    (operation) => {
      puzzleProgress.set({});
      customProgress.set({});
      solvedPuzzles.set({});
      const setItem = vi.fn();
      vi.stubGlobal("window", {});
      vi.stubGlobal("localStorage", {
        getItem: () => {
          if (fault === "blocked") throw new Error("blocked getter");
          return fault;
        },
        setItem,
      });
      const actions = {
        save: () => puzzleProgress.save("day", "easy", { elapsed: 1, filled: 1, empty: 81 }),
        clear: () => puzzleProgress.clear("day", "easy"),
        markSolved: () => solvedPuzzles.markSolved("day", "easy", 1),
        isCurrent: () => expect(puzzleProgress.isCurrent("day", "easy")).toBe(false),
        "custom save": () =>
          customProgress.save("puzzles", "key", { elapsed: 1, filled: 1, empty: 81 }),
      };
      expect(actions[operation]).not.toThrow();
      expect(setItem).not.toHaveBeenCalled();
    }
  );
}
it("does not write solved records if their read fails after a valid progress read", () => {
  puzzleProgress.set({});
  vi.stubGlobal("window", {});
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: (key) => {
      if (key === "sudoku-solved") throw new Error("blocked");
      return "{}";
    },
    setItem,
  });
  expect(() => solvedPuzzles.markSolved("day", "easy", 1)).not.toThrow();
  expect(setItem).not.toHaveBeenCalled();
});
it("keeps stored unrelated records and accepts a later save after reads recover", () => {
  puzzleProgress.set({});
  const data = new Map([["sudoku-progress", JSON.stringify({ other: { hard: { elapsed: 42 } } })]]);
  let blocked = true;
  const setItem = vi.fn((key, value) => data.set(key, value));
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key) => {
      if (blocked) throw Error("blocked");
      return data.get(key) ?? null;
    },
    setItem,
  });
  expect(() =>
    puzzleProgress.save("day", "easy", { elapsed: 1, filled: 1, empty: 81 })
  ).not.toThrow();
  expect(setItem).not.toHaveBeenCalled();
  blocked = false;
  expect(puzzleProgress.save("day", "easy", { elapsed: 2, filled: 1, empty: 81 })).toBe(true);
  expect(JSON.parse(data.get("sudoku-progress")).other.hard.elapsed).toBe(42);
});
