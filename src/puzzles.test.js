import { describe, it, expect } from "vitest";
import { puzzleData } from "./puzzles.js";

describe("puzzleData", () => {
  it("keys are ISO dates and every puzzle is 81 digits", () => {
    const dates = Object.keys(puzzleData);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const [difficulty, q] of Object.entries(puzzleData[date])) {
        expect(["easy", "medium", "hard"]).toContain(difficulty);
        expect(q).toMatch(/^[0-9]{81}$/);
      }
    }
  });
});
