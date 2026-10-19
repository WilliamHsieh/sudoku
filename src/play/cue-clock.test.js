import { describe, it, expect } from "vitest";
import { CUE_FLASH_MS, CUE_IDLE_MS, createCueClock, idleMsFromSearch } from "./cue-clock.js";

describe("idleMsFromSearch", () => {
  it("defaults to 30s", () => {
    expect(CUE_IDLE_MS).toBe(30_000);
    expect(idleMsFromSearch("")).toBe(30_000);
    expect(idleMsFromSearch("?cueMs=0")).toBe(30_000);
    expect(idleMsFromSearch("?cueMs=nope")).toBe(30_000);
  });

  it("accepts a positive cueMs override", () => {
    expect(idleMsFromSearch("?cueMs=3000")).toBe(3000);
  });
});

describe("cue clock", () => {
  /** @param {{ idleMs?: number, flashMs?: number }} [opts] */
  function clock(opts) {
    return createCueClock(opts);
  }

  it("fires after 30s of no input and repeats on that clock", () => {
    const c = clock();
    c.bump(0);
    expect(c.tick(29_999)).toBe(false);
    expect(c.phase).toBe("idle");
    expect(c.tick(30_000)).toBe(true);
    expect(c.phase).toBe("flash");
    expect(c.justFired).toBe(true);
    expect(c.tick(30_000 + CUE_FLASH_MS - 1)).toBe(false);
    expect(c.tick(30_000 + CUE_FLASH_MS)).toBe(true);
    expect(c.phase).toBe("idle");
    expect(c.tick(59_999)).toBe(false);
    expect(c.tick(60_000)).toBe(true);
    expect(c.phase).toBe("flash");
    expect(c.justFired).toBe(true);
  });

  it("resets on activity and ends a pulse that is already showing", () => {
    const c = clock();
    c.bump(0);
    c.tick(30_000);
    expect(c.showing).toBe(true);
    c.bump(31_000);
    expect(c.phase).toBe("idle");
    expect(c.showing).toBe(false);
    expect(c.tick(60_999)).toBe(false);
    expect(c.tick(61_000)).toBe(true);
    expect(c.phase).toBe("flash");
  });

  it("does not fire while blocked, and the countdown starts over when unblocked", () => {
    const c = clock();
    c.bump(0);
    c.setBlocked(true);
    c.bump(10_000);
    expect(c.tick(50_000)).toBe(false);
    expect(c.showing).toBe(false);
    c.setBlocked(false);
    c.bump(50_000);
    expect(c.tick(79_999)).toBe(false);
    expect(c.tick(80_000)).toBe(true);
    expect(c.phase).toBe("flash");
  });

  it("stays off in Manual and keeps the saved preference", () => {
    const c = clock();
    c.bump(0);
    expect(c.switchOn).toBe(true);
    c.setAuto(false);
    expect(c.switchDisabled).toBe(true);
    expect(c.switchOn).toBe(false);
    expect(c.enabled).toBe(true);
    expect(c.tick(60_000)).toBe(false);
    expect(c.showing).toBe(false);
    c.setAuto(true);
    expect(c.switchOn).toBe(true);
    expect(c.switchDisabled).toBe(false);
  });

  it("holds a static tint under reduced motion until the next input", () => {
    const c = clock();
    c.setReduced(true);
    c.bump(0);
    expect(c.tick(30_000)).toBe(true);
    expect(c.phase).toBe("hold");
    expect(c.tick(90_000)).toBe(false);
    expect(c.phase).toBe("hold");
    c.bump(91_000);
    expect(c.phase).toBe("idle");
    expect(c.showing).toBe(false);
  });

  it("drops a pulse immediately when the preference is turned off", () => {
    const c = clock();
    c.bump(0);
    c.tick(30_000);
    expect(c.showing).toBe(true);
    c.setEnabled(false);
    expect(c.showing).toBe(false);
    expect(c.switchOn).toBe(false);
    expect(c.tick(120_000)).toBe(false);
  });
});
