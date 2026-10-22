import { describe, it, expect } from "vitest";
import { ARM_PX, DISARM_PX, DOUBLE_TAP_MS, TAP_MAX_MS, TAP_MAX_TRAVEL } from "./pad.js";
import {
  HOLD_MS,
  LOCK_RATIO,
  LOCK_TICK_MS,
  TOAST_MS,
  classifyPress,
  classifyRelease,
  digitFromCode,
  nextLockArmed,
} from "./key-gesture.js";

const press = (over = {}) =>
  classifyPress(
    { shown: 0, locked: 0, lastD: 0, lastT: -Infinity, legacy: false, ...over },
    over.d ?? 5,
    over.now ?? 1000
  );

/** @param {Partial<import('./key-gesture.js').ReleaseView>} over */
const release = (over = {}) =>
  classifyRelease({
    cancelled: false,
    maxTravel: 0,
    elapsed: 80,
    toggled: 0,
    armLock: false,
    armed: false,
    dbl: false,
    legacy: false,
    d: 5,
    wasLocked: 0,
    wasShown: false,
    ...over,
  });

describe("nextLockArmed", () => {
  it("arms at 28px of downward travel and not at 20px", () => {
    expect(nextLockArmed(false, 20, 0)).toBe(false);
    expect(nextLockArmed(false, ARM_PX - 1, 0)).toBe(false);
    expect(nextLockArmed(false, ARM_PX, 0)).toBe(true);
  });

  it("requires the drag to be steeper than the horizontal travel", () => {
    expect(nextLockArmed(false, 40, 40 / LOCK_RATIO)).toBe(false);
    expect(nextLockArmed(false, 40, 10)).toBe(true);
  });

  it("disarms below 22px and holds between the thresholds", () => {
    expect(nextLockArmed(true, DISARM_PX, 0)).toBe(true);
    expect(nextLockArmed(true, DISARM_PX - 1, 0)).toBe(false);
    expect(nextLockArmed(true, 24, 0)).toBe(true);
  });
});

describe("digitFromCode", () => {
  it("reads the physical digit, including the numpad", () => {
    expect(digitFromCode("Digit5")).toBe(5);
    expect(digitFromCode("Numpad9")).toBe(9);
    expect(digitFromCode("Digit0")).toBe(0);
    expect(digitFromCode("KeyZ")).toBe(0);
  });
});

describe("classifyPress", () => {
  it("shows on the first press and does not fill", () => {
    expect(press()).toEqual({ dbl: false, fill: false, show: true });
  });

  it("fills on a second press within 300ms and does not toggle the highlight off", () => {
    const second = press({ shown: 5, lastD: 5, lastT: 1000, now: 1000 + DOUBLE_TAP_MS, d: 5 });
    expect(second).toEqual({ dbl: true, fill: true, show: false });
  });

  it("a gap over 300ms is another single press", () => {
    const second = press({
      shown: 5,
      lastD: 5,
      lastT: 1000,
      now: 1000 + DOUBLE_TAP_MS + 1,
      d: 5,
    });
    expect(second.fill).toBe(false);
    expect(second.show).toBe(true);
  });

  it("does not show on press while a digit is locked", () => {
    expect(press({ locked: 5, d: 3 }).show).toBe(false);
  });

  it("does not treat a press on the locked digit as a double-tap fill", () => {
    expect(press({ locked: 5, shown: 5, lastD: 5, lastT: 900, now: 1000, d: 5 }).fill).toBe(false);
  });

  it("legacy mode does not show or double-tap fill", () => {
    expect(press({ legacy: true })).toEqual({ dbl: false, fill: false, show: false });
    expect(press({ legacy: true, shown: 5, lastD: 5, lastT: 900, now: 1000 }).fill).toBe(false);
  });
});

describe("classifyRelease", () => {
  it("a still release of a fresh press is a show, and a second single tap hides later", () => {
    expect(release()).toBe("show");
    expect(release({ wasShown: true })).toBe("hide-later");
  });

  it("travel, duration or cancel is not a tap", () => {
    expect(release({ maxTravel: TAP_MAX_TRAVEL })).toBe("ignore");
    expect(release({ elapsed: TAP_MAX_MS })).toBe("ignore");
    expect(release({ cancelled: true })).toBe("cancel");
  });

  it("20px down does nothing; 28px locks; backing up under 22px cancels", () => {
    expect(release({ maxTravel: 20, armLock: false })).toBe("ignore");
    expect(release({ maxTravel: 28, armLock: true })).toBe("lock");
    expect(release({ maxTravel: 30, armLock: false, wasShown: false })).toBe("ignore");
  });

  it("swipe-down on the locked digit unlocks, and on another digit switches", () => {
    expect(release({ armLock: true, wasLocked: 5, d: 5 })).toBe("unlock-swipe");
    expect(release({ armLock: true, wasLocked: 5, d: 3 })).toBe("switch-lock");
  });

  it("swipe-down wins over swipe-up, and a two-finger hold wins over a tap", () => {
    expect(release({ armLock: true, armed: true })).toBe("lock");
    expect(release({ toggled: 2, armed: true })).toBe("held");
  });

  it("a tap on the locked key unlocks; a tap on another key shows it", () => {
    expect(release({ wasLocked: 5, d: 5 })).toBe("unlock-tap");
    expect(release({ wasLocked: 5, d: 3 })).toBe("show-other");
  });

  it("legacy tap fills on release; a double-tap that already filled is ignored", () => {
    expect(release({ legacy: true })).toBe("legacy");
    expect(release({ dbl: true })).toBe("ignore");
  });

  it("uses the spec timings", () => {
    expect(HOLD_MS).toBe(250);
    expect(LOCK_TICK_MS).toBe(700);
    expect(TOAST_MS).toBe(1600);
  });
});
