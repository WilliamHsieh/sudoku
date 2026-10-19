import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { formatTime, resetTimer, timer, timerRunning, solvedPuzzles } from "./store.js";

describe("formatTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
    expect(formatTime(3725)).toBe("62:05");
  });
});

describe("resetTimer", () => {
  it("zeroes the timer and starts it running", () => {
    timer.set(42);
    timerRunning.set(false);
    resetTimer();
    expect(get(timer)).toBe(0);
    expect(get(timerRunning)).toBe(true);
  });
});

describe("solvedPuzzles", () => {
  it("records a solve per date and difficulty", () => {
    expect(solvedPuzzles.isSolved("2025-06-01", "easy")).toBe(false);
    solvedPuzzles.markSolved("2025-06-01", "easy", 123);
    expect(solvedPuzzles.isSolved("2025-06-01", "easy")).toBe(true);
    expect(solvedPuzzles.isSolved("2025-06-01", "hard")).toBe(false);
    const entry = get(solvedPuzzles)["2025-06-01"].easy;
    expect(entry.completed).toBe(true);
    expect(entry.time).toBe(123);
    expect(typeof entry.timestamp).toBe("number");
  });
});
