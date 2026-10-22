import { describe, expect, it } from "vitest";
import { isAway, latestAnnouncement, monthsToLatest } from "./home.js";
import { startOfMonth } from "./format.js";

const latest = "2026-10-21";

describe("Journal home", () => {
  it.each([true, false])("entry is home (mobile %s)", (mobile) => {
    expect(isAway(startOfMonth(latest), null, latest, mobile)).toBe(false);
  });

  it.each([true, false])("selecting latest still counts as home (mobile %s)", (mobile) => {
    expect(isAway(startOfMonth(latest), latest, latest, mobile)).toBe(false);
  });

  it("a different selected day is away on desktop", () => {
    expect(isAway(startOfMonth(latest), "2026-10-09", latest, false)).toBe(true);
  });

  it("a mobile sheet selection does not make the month away", () => {
    expect(isAway(startOfMonth(latest), "2026-10-09", latest, true)).toBe(false);
  });

  it.each([true, false])(
    "another month is away even with latest selected (mobile %s)",
    (mobile) => {
      expect(isAway(startOfMonth("2026-08-01"), latest, latest, mobile)).toBe(true);
    }
  );

  it.each([
    ["2026-08-01", latest, 2],
    ["2025-10-01", latest, 12],
    ["2026-11-01", "2026-10-31", -1],
    ["2027-01-01", latest, -3],
    ["2026-10-01", latest, 0],
  ])("returns from %s toward %s in one jump of %s months", (view, day, count) => {
    expect(monthsToLatest(startOfMonth(view), day)).toBe(count);
  });

  it("uses the exact spoken copy", () => {
    expect(latestAnnouncement(latest)).toBe("October 2026, latest puzzles Wed, Oct 21");
  });

  it("announces latest's month and year across the year boundary", () => {
    expect(latestAnnouncement("2025-12-31")).toBe("December 2025, latest puzzles Wed, Dec 31");
  });
});
