import { describe, expect, it } from "vitest";
import { firstUnsolvedLatest, firstUnsolvedPuzzle, latestPuzzleDay } from "./daily.js";

const data = {
  "2026-10-17": { easy: "e17", medium: "m17" },
  "2026-10-18": { easy: "e18", medium: "m18", hard: "h18" },
};

describe("latestPuzzleDay", () => {
  it("picks the last day on or before today", () => {
    expect(latestPuzzleDay(data, "2026-10-19")).toBe("2026-10-18");
    expect(latestPuzzleDay(data, "2026-10-17")).toBe("2026-10-17");
    expect(latestPuzzleDay(data, "2020-01-01")).toBeNull();
  });
});

describe("firstUnsolvedPuzzle", () => {
  it("skips solved difficulties then falls back to the first available", () => {
    expect(firstUnsolvedPuzzle(data, {}, "2026-10-18")).toEqual({
      dateStr: "2026-10-18",
      difficulty: "easy",
      puzzle: "e18",
    });
    expect(
      firstUnsolvedPuzzle(data, { "2026-10-18": { easy: { completed: true } } }, "2026-10-18")
    ).toEqual({
      dateStr: "2026-10-18",
      difficulty: "medium",
      puzzle: "m18",
    });
    const all = {
      "2026-10-18": {
        easy: { completed: true },
        medium: { completed: true },
        hard: { completed: true },
      },
    };
    expect(firstUnsolvedPuzzle(data, all, "2026-10-18")?.difficulty).toBe("easy");
  });
});

describe("firstUnsolvedLatest", () => {
  it("uses the latest day not in the future", () => {
    const pick = firstUnsolvedLatest(data, {}, new Date("2026-10-19T12:00:00"));
    expect(pick?.dateStr).toBe("2026-10-18");
    expect(pick?.difficulty).toBe("easy");
  });
});
