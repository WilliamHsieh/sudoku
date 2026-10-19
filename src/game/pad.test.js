import { describe, it, expect } from "vitest";
import {
  TAP_MAX_TRAVEL,
  TAP_MAX_MS,
  ARM_PX,
  DISARM_PX,
  rubberBand,
  isTap,
  nextArmed,
  shouldLift,
  ringTiming,
  RING,
  nextDoubleTap,
  DOUBLE_TAP_MS,
} from "./pad.js";

describe("rubberBand", () => {
  it("compresses downward drags", () => {
    expect(rubberBand(-40)).toBeCloseTo(-10);
    expect(rubberBand(0)).toBe(0);
  });

  it("is linear up to the arm threshold, then eases", () => {
    expect(rubberBand(ARM_PX)).toBeCloseTo(ARM_PX * 0.85);
    expect(rubberBand(ARM_PX / 2)).toBeCloseTo((ARM_PX / 2) * 0.85);
    expect(rubberBand(80)).toBeGreaterThan(rubberBand(ARM_PX));
    expect(rubberBand(80) - rubberBand(ARM_PX)).toBeLessThan(80 - ARM_PX);
  });
});

describe("isTap", () => {
  it("a short, still press is a tap", () => {
    expect(isTap({ maxTravel: 0, elapsed: 80 })).toBe(true);
    expect(isTap({ maxTravel: TAP_MAX_TRAVEL - 1, elapsed: TAP_MAX_MS - 1 })).toBe(true);
  });

  it("travel, duration or cancel makes it not a tap", () => {
    expect(isTap({ maxTravel: TAP_MAX_TRAVEL, elapsed: 80 })).toBe(false);
    expect(isTap({ maxTravel: 0, elapsed: TAP_MAX_MS })).toBe(false);
    expect(isTap({ maxTravel: 0, elapsed: 80, cancelled: true })).toBe(false);
  });
});

describe("nextArmed", () => {
  it("arms at 28px and disarms below 22px", () => {
    expect(nextArmed(false, ARM_PX - 1, true)).toBe(false);
    expect(nextArmed(false, ARM_PX, true)).toBe(true);
    expect(nextArmed(true, DISARM_PX, true)).toBe(true);
    expect(nextArmed(true, DISARM_PX - 1, true)).toBe(false);
  });

  it("never arms when a note cannot be written", () => {
    expect(nextArmed(false, 40, false)).toBe(false);
    expect(nextArmed(true, 40, false)).toBe(false);
  });
});

describe("shouldLift", () => {
  it("starts a lift on a clearly upward drag", () => {
    expect(shouldLift(TAP_MAX_TRAVEL, 0)).toBe(false);
    expect(shouldLift(TAP_MAX_TRAVEL + 1, 0)).toBe(true);
    expect(shouldLift(20, 30)).toBe(false);
    expect(shouldLift(20, 10)).toBe(true);
  });
});

describe("nextDoubleTap", () => {
  it("two taps on the same cell within 300ms are a double-tap", () => {
    const first = nextDoubleTap({ i: -1, t: -Infinity, hl: 0 }, 5, 1000, 8);
    expect(first.isDouble).toBe(false);
    expect(first.next).toEqual({ i: 5, t: 1000, hl: 8 });
    const second = nextDoubleTap(first.next, 5, 1000 + DOUBLE_TAP_MS, 0);
    expect(second.isDouble).toBe(true);
    expect(second.highlighted).toBe(8);
    expect(second.next.i).toBe(-1);
  });

  it("a different cell or a gap over 300ms is a new first tap", () => {
    const first = nextDoubleTap({ i: -1, t: -Infinity, hl: 0 }, 5, 1000, 8);
    expect(nextDoubleTap(first.next, 6, 1100, 0).isDouble).toBe(false);
    expect(nextDoubleTap(first.next, 5, 1000 + DOUBLE_TAP_MS + 1, 0).isDouble).toBe(false);
  });
});

describe("ringTiming", () => {
  it("in-place is 150ms; neighbours are near; far corners approach 450ms", () => {
    expect(ringTiming(0, 0).travel).toBe(RING.inPlace);
    expect(ringTiming(0, 1).travel).toBe(RING.near);
    expect(ringTiming(0, 80).travel).toBeGreaterThan(ringTiming(0, 1).travel);
    expect(ringTiming(0, 80).travel).toBeLessThanOrEqual(RING.far);
  });

  it("rapid repeats run at half speed", () => {
    const slow = ringTiming(0, 40);
    const fast = ringTiming(0, 40, true);
    expect(fast.travel).toBe(Math.round(slow.travel * 0.5));
    expect(fast.apply).toBe(slow.apply * 0.5);
  });
});
