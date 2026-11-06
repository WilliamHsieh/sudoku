import { expect, it } from "vitest";
import { mergeEntry } from "./persistence.js";
it("rejects a stale tab's save without replacing the newer entry", () => {
  const expected = { day: { easy: { filled: 1 } } };
  const latest = { day: { easy: { filled: 2 } } };
  expect(mergeEntry(latest, expected, "day", "easy", { filled: 3 })).toBeNull();
  expect(latest.day.easy.filled).toBe(2);
});
it("merges unrelated puzzle changes and removes only the requested entry", () => {
  const expected = { day: { easy: { filled: 1 } } };
  const latest = { day: { easy: { filled: 1 }, hard: { filled: 5 } } };
  expect(mergeEntry(latest, expected, "day", "easy", { filled: 2 })).toEqual({
    day: { easy: { filled: 2 }, hard: { filled: 5 } },
  });
  expect(mergeEntry(latest, expected, "day", "easy", null)).toEqual({
    day: { hard: { filled: 5 } },
  });
});
