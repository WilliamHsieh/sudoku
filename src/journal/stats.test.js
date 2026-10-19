import { describe, expect, it } from "vitest";
import {
  longestStreak,
  monthCells,
  monthStats,
  puzzleState,
  solvedCount,
  streakFrom,
  unfinishedList,
} from "./stats.js";

const data = {
  "2026-10-16": { easy: "e", medium: "m", hard: "h" },
  "2026-10-17": { easy: "e", medium: "m", hard: "h" },
  "2026-10-18": { easy: "e", medium: "m", hard: "h" },
};

describe("puzzleState", () => {
  it("prefers a completed solve over leftover progress", () => {
    const solved = { "2026-10-18": { easy: { completed: true, time: 100, timestamp: 1 } } };
    const progress = {
      "2026-10-18": { easy: { elapsed: 40, filled: 2, empty: 50, updatedAt: 2 } },
    };
    expect(puzzleState(solved, progress, "2026-10-18", "easy").kind).toBe("solved");
  });

  it("computes fill percent as filled/empty", () => {
    const st = puzzleState(
      {},
      { "2026-10-18": { medium: { elapsed: 700, filled: 24, empty: 52, updatedAt: 1 } } },
      "2026-10-18",
      "medium"
    );
    expect(st.kind).toBe("progress");
    if (st.kind === "progress") expect(st.pct).toBe(46);
  });
});

describe("streakFrom", () => {
  it("counts consecutive puzzle days with a solve, starting from latest", () => {
    const solved = {
      "2026-10-16": { easy: { completed: true } },
      "2026-10-17": { medium: { completed: true } },
      "2026-10-18": { easy: { completed: true } },
    };
    expect(streakFrom(data, solved, "2026-10-18")).toBe(3);
  });

  it("does not require a solve on the latest day itself", () => {
    const solved = {
      "2026-10-16": { easy: { completed: true } },
      "2026-10-17": { easy: { completed: true } },
    };
    expect(streakFrom(data, solved, "2026-10-18")).toBe(2);
  });
});

describe("longestStreak", () => {
  it("is the best run of solved puzzle days", () => {
    const solved = {
      "2026-10-16": { easy: { completed: true } },
      "2026-10-18": { easy: { completed: true } },
    };
    expect(longestStreak(data, solved, "2026-10-18")).toBe(1);
    expect(solvedCount(solved, "2026-10-16")).toBe(1);
  });
});

describe("unfinishedList", () => {
  it("sorts newest activity first and skips solved diffs", () => {
    const progress = {
      "2026-10-15": { hard: { elapsed: 10, filled: 1, empty: 50, updatedAt: 100 } },
      "2026-10-18": { medium: { elapsed: 20, filled: 2, empty: 50, updatedAt: 200 } },
    };
    const list = unfinishedList(progress, {});
    expect(list.map((x) => `${x.date}:${x.diff}`)).toEqual([
      "2026-10-18:medium",
      "2026-10-15:hard",
    ]);
  });
});

describe("monthStats", () => {
  it("counts solves, averages and in-progress in the viewed month", () => {
    const solved = { "2026-10-18": { easy: { completed: true, time: 120, timestamp: 1 } } };
    const progress = {
      "2026-10-18": { medium: { elapsed: 10, filled: 1, empty: 50, updatedAt: 1 } },
    };
    const md = monthStats(data, solved, progress, new Date(2026, 9, 1));
    expect(md.days).toBe(3);
    expect(md.tot).toBe(1);
    expect(md.unf).toBe(1);
    expect(md.rows.easy.n).toBe(1);
    expect(md.rows.easy.avg).toBe(120);
  });
});

describe("monthCells", () => {
  it("marks missing past days as nop and later days as future", () => {
    const cells = monthCells(data, "2026-10-18", "2026-10-19", new Date(2026, 9, 1));
    const byDay = Object.fromEntries(cells.filter(Boolean).map((c) => [c.day, c]));
    expect(byDay[16].kind).toBe("puzzle");
    expect(byDay[19].kind).toBe("future");
    expect(byDay[19].notYet).toBe(true);
    expect(byDay[20].notYet).toBe(false);
  });
});
