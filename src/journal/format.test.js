import { describe, expect, it } from "vitest";
import { addDays, fmtTime, longDate, shortDate, startOfMonth } from "./format.js";

describe("fmtTime", () => {
  it("uses m:ss under an hour and h:mm:ss at or above", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(252)).toBe("4:12");
    expect(fmtTime(3599)).toBe("59:59");
    expect(fmtTime(3600)).toBe("1:00:00");
    expect(fmtTime(1325)).toBe("22:05");
  });
});

describe("dates", () => {
  it("formats short and long US dates", () => {
    expect(shortDate("2026-10-18")).toBe("Sun, Oct 18");
    expect(longDate("2026-10-18")).toBe("Sunday, October 18");
    expect(addDays("2026-10-18", -1)).toBe("2026-10-17");
    expect(startOfMonth("2026-10-18")).toEqual(new Date(2026, 9, 1));
  });
});
