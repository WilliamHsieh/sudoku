import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHintFocus } from "./focus.svelte.js";

describe("hint coordinate focus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("flashes only the requested cell and clears after 900ms", () => {
    const focus = createHintFocus();
    focus.flash(44);
    expect(focus.cell).toBe(44);
    vi.advanceTimersByTime(899);
    expect(focus.cell).toBe(44);
    vi.advanceTimersByTime(1);
    expect(focus.cell).toBe(-1);
  });
  it("restarts repeated taps and replaces a different coordinate", () => {
    const focus = createHintFocus();
    focus.flash(44);
    const first = focus.sequence;
    vi.advanceTimersByTime(800);
    focus.flash(44);
    expect(focus.sequence).toBe(first + 1);
    vi.advanceTimersByTime(100);
    expect(focus.cell).toBe(44);
    focus.flash(80);
    expect(focus.cell).toBe(80);
    vi.advanceTimersByTime(900);
    expect(focus.cell).toBe(-1);
  });
  it("ignores invalid references and cancels on stage change or dismissal", () => {
    const focus = createHintFocus();
    focus.flash(0);
    for (const invalid of [-1, 81, 1.5, NaN]) focus.flash(invalid);
    expect(focus.cell).toBe(0);
    focus.clear();
    expect(focus.cell).toBe(-1);
    vi.runAllTimers();
    expect(focus.cell).toBe(-1);
  });
});
