import { describe, it, expect } from "vitest";
import { solvedModel, spokenTime } from "./solved.js";
const day = "2026-11-01";
const puzzles = Object.fromEntries(
  ["2026-10-29", "2026-10-30", "2026-10-31", day].map((d) => [
    d,
    { easy: "p", medium: "m", hard: "h" },
  ])
);
const entry = (time = 402) => ({ completed: true, time });
const base = {
  date: day,
  difficulty: "easy",
  time: 402,
  solved: { [day]: { easy: entry() } },
  progress: {},
  puzzles,
  now: new Date("2026-11-01T12:00:00"),
};
const model = (overrides = {}) => solvedModel({ ...base, ...overrides });
describe("solved result data", () => {
  it("excludes the just-saved sample from the average", () => {
    expect(model({ solved: { ...base.solved, "2026-10-31": { easy: entry(490) } } }).delta).toBe(
      -88
    );
  });
  it("drops an absent average on a first ever solve and shows a one-day streak", () => {
    expect(model()).toMatchObject({ delta: null, streak: 1, count: 1, label: "Next: Medium" });
  });
  it("drops the average at a new difficulty", () => {
    expect(model({ solved: { ...base.solved, "2026-10-31": { medium: entry() } } }).delta).toBe(
      null
    );
  });
  it("keeps positive slower deltas", () => {
    const m = model({ time: 621, solved: { ...base.solved, "2026-10-31": { easy: entry(490) } } });
    expect(m.delta).toBe(131);
    expect(m.announcement).toContain("2 minutes 11 seconds slower than your Easy average");
  });
  it("does not show New best without an earlier best", () => expect(model().newBest).toBe(false));
  it("shows New best only for a strictly faster record at this difficulty", () => {
    const solved = { ...base.solved, "2026-10-31": { easy: entry(490) } };
    expect(model({ solved }).newBest).toBe(true);
    expect(model({ solved, time: 490 }).newBest).toBe(false);
    expect(model({ solved, time: 500 }).newBest).toBe(false);
  });
  it.each([null, "2026-10-29"])(
    "past/custom falls back to Journal when today is complete: %s",
    (date) => {
      expect(
        model({ date, solved: { [day]: { easy: entry(), medium: entry(), hard: entry() } } })
      ).toMatchObject({ label: "Journal", target: null });
    }
  );
  it("counts consecutive puzzle days", () => {
    const solved = Object.fromEntries(Object.keys(puzzles).map((d) => [d, { easy: entry() }]));
    expect(model({ solved }).streak).toBe(4);
  });
  it("hides a zero streak for an isolated back-dated solve", () => {
    expect(model({ date: "2026-10-29", solved: { "2026-10-29": { easy: entry() } } }).streak).toBe(
      0
    );
  });
  it.each([1, 2, 3])("counts %i solved on the played date", (n) => {
    const solved = {
      [day]: Object.fromEntries(["easy", "medium", "hard"].slice(0, n).map((d) => [d, entry()])),
    };
    expect(model({ solved }).count).toBe(n);
  });
  it("resumes most recently touched unfinished after the last solve of the day", () => {
    const solved = { [day]: { easy: entry(), medium: entry(), hard: entry() } };
    const progress = {
      "2026-10-30": { easy: { elapsed: 80, updatedAt: 20 } },
      "2026-10-31": { medium: { elapsed: 90, updatedAt: 30 } },
    };
    expect(model({ solved, progress })).toMatchObject({
      label: "Resume Oct 31 · Medium",
      target: { dateStr: "2026-10-31", difficulty: "medium" },
      resume: true,
    });
  });
  it("uses Journal when all of today is solved and nothing is unfinished", () => {
    expect(
      model({ solved: { [day]: { easy: entry(), medium: entry(), hard: entry() } } })
    ).toMatchObject({ label: "Journal", target: null });
  });
  it("does not replay a solved difficulty through firstUnsolvedPuzzle's fallback", () => {
    expect(
      model({ solved: { [day]: { easy: entry(), medium: entry(), hard: entry() } } }).target
    ).toBeNull();
  });
  it("back-dated results show that day's marks and target today", () => {
    expect(
      model({ date: "2026-10-29", solved: { "2026-10-29": { easy: entry() } } })
    ).toMatchObject({
      dayLabel: "Oct 29",
      count: 1,
      label: "Today: Easy",
      target: { dateStr: day },
    });
  });
  it("custom results have no statistics", () => {
    expect(model({ date: null, difficulty: null })).toMatchObject({
      dated: false,
      delta: null,
      streak: 0,
      kinds: [],
      label: "Today: Medium",
    });
  });
  it("omits missing clauses in announcements", () =>
    expect(model().announcement).toBe("Solved in 6 minutes 42 seconds. 1-day streak."));
  it.each([
    [0, "0 seconds"],
    [60, "1 minute"],
    [88, "1 minute 28 seconds"],
    [402, "6 minutes 42 seconds"],
  ])("speaks %i seconds", (seconds, text) => expect(spokenTime(seconds)).toBe(text));
});
