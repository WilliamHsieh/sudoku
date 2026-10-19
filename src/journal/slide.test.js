import { describe, expect, it } from "vitest";
import { SLIDE_EASE, SLIDE_MS, slideOffsets } from "./slide.js";

describe("slideOffsets", () => {
  it("brings the previous month in from the left", () => {
    expect(slideOffsets(-1, 400)).toEqual({ start: -400, end: 0 });
  });

  it("brings the next month in from the right", () => {
    expect(slideOffsets(1, 400)).toEqual({ start: 0, end: -400 });
  });

  it("continues a drag instead of restarting at the resting edge", () => {
    expect(slideOffsets(-1, 400, 80)).toEqual({ start: -320, end: 0 });
    expect(slideOffsets(1, 400, -70)).toEqual({ start: -70, end: -400 });
  });

  it("uses a 300ms ease with no bounce", () => {
    expect(SLIDE_MS).toBe(300);
    expect(SLIDE_EASE).toBe("cubic-bezier(.22,.8,.24,1)");
  });
});
