import { afterEach, describe, expect, it, vi } from "vitest";
import { applyWeekdayFavicon, faviconPath, watchWeekdayFavicon, weekdayDigit } from "./favicon.js";

describe("weekdayDigit", () => {
  it("maps Monday to 1 and Sunday to 7", () => {
    expect(weekdayDigit(new Date(2026, 9, 19))).toBe(1);
    expect(weekdayDigit(new Date(2026, 9, 20))).toBe(2);
    expect(weekdayDigit(new Date(2026, 9, 21))).toBe(3);
    expect(weekdayDigit(new Date(2026, 9, 22))).toBe(4);
    expect(weekdayDigit(new Date(2026, 9, 23))).toBe(5);
    expect(weekdayDigit(new Date(2026, 9, 24))).toBe(6);
    expect(weekdayDigit(new Date(2026, 9, 25))).toBe(7);
    expect(weekdayDigit(new Date(2026, 9, 25, 23, 59, 59))).toBe(7);
    expect(weekdayDigit(new Date(2026, 9, 26, 0, 0, 0))).toBe(1);
  });
});

describe("faviconPath", () => {
  it("resolves both sizes under the site base", () => {
    expect(faviconPath(7, 16, "/sudoku/")).toBe("/sudoku/favicon/I7-16.svg");
    expect(faviconPath(1, 32, "/sudoku")).toBe("/sudoku/favicon/I1-32.svg");
  });
});

/**
 * @param {string} [visibility]
 */
function fakeDocument(visibility = "visible") {
  /** @type {Record<string, { href: string }>} */
  const links = {
    "16x16": { href: "/sudoku/favicon/I7-16.svg" },
    "32x32": { href: "/sudoku/favicon/I7-32.svg" },
  };
  /** @type {Map<string, () => void>} */
  const listeners = new Map();
  const api = {
    visibilityState: visibility,
    /**
     * @param {string} selector
     */
    querySelector(selector) {
      const match = selector.match(/sizes="([^"]+)"/);
      if (!match) return null;
      return links[match[1]] ?? null;
    },
    /**
     * @param {string} type
     * @param {() => void} listener
     */
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    /**
     * @param {string} type
     * @param {() => void} listener
     */
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  return {
    doc: /** @type {Document} */ (/** @type {unknown} */ (api)),
    /**
     * @param {string} state
     */
    setVisibility(state) {
      api.visibilityState = state;
    },
    /**
     * @param {string} type
     */
    emit(type) {
      listeners.get(type)?.();
    },
    /**
     * @param {16 | 32} size
     */
    href(size) {
      return links[`${size}x${size}`].href;
    },
  };
}

describe("watchWeekdayFavicon", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets both tab icons from the local weekday on load", () => {
    const fake = fakeDocument();
    const stop = watchWeekdayFavicon(fake.doc, "/sudoku/", () => new Date(2026, 9, 19, 8, 30, 0));
    expect(fake.href(16)).toBe("/sudoku/favicon/I1-16.svg");
    expect(fake.href(32)).toBe("/sudoku/favicon/I1-32.svg");
    stop();
  });

  it("swaps both icons when local midnight rolls the weekday", () => {
    vi.useFakeTimers();
    let current = new Date(2026, 9, 22, 23, 59, 50);
    const fake = fakeDocument();
    const stop = watchWeekdayFavicon(fake.doc, "/sudoku/", () => current);

    expect(fake.href(16)).toBe("/sudoku/favicon/I4-16.svg");
    expect(fake.href(32)).toBe("/sudoku/favicon/I4-32.svg");

    current = new Date(2026, 9, 23, 0, 0, 1);
    vi.advanceTimersByTime(11_000);

    expect(fake.href(16)).toBe("/sudoku/favicon/I5-16.svg");
    expect(fake.href(32)).toBe("/sudoku/favicon/I5-32.svg");
    stop();
  });

  it("rolls Saturday night into Sunday 7", () => {
    vi.useFakeTimers();
    let current = new Date(2026, 9, 24, 23, 59, 59);
    const fake = fakeDocument();
    const stop = watchWeekdayFavicon(fake.doc, "/sudoku/", () => current);
    expect(fake.href(16)).toBe("/sudoku/favicon/I6-16.svg");

    current = new Date(2026, 9, 25, 0, 0, 0);
    vi.advanceTimersByTime(1_000);

    expect(weekdayDigit(current)).toBe(7);
    expect(fake.href(16)).toBe("/sudoku/favicon/I7-16.svg");
    expect(fake.href(32)).toBe("/sudoku/favicon/I7-32.svg");
    stop();
  });

  it("refreshes on visibility when the local day changed while hidden", () => {
    vi.useFakeTimers();
    let current = new Date(2026, 9, 24, 21, 0, 0);
    const fake = fakeDocument("hidden");
    const stop = watchWeekdayFavicon(fake.doc, "/sudoku/", () => current);
    expect(fake.href(16)).toBe("/sudoku/favicon/I6-16.svg");

    current = new Date(2026, 9, 25, 9, 0, 0);
    fake.emit("visibilitychange");
    expect(fake.href(16)).toBe("/sudoku/favicon/I6-16.svg");

    fake.setVisibility("visible");
    fake.emit("visibilitychange");
    expect(fake.href(16)).toBe("/sudoku/favicon/I7-16.svg");
    expect(fake.href(32)).toBe("/sudoku/favicon/I7-32.svg");
    stop();
  });

  it("does not fire again after stop", () => {
    vi.useFakeTimers();
    let current = new Date(2026, 9, 22, 23, 59, 50);
    const fake = fakeDocument();
    const stop = watchWeekdayFavicon(fake.doc, "/sudoku/", () => current);
    stop();
    current = new Date(2026, 9, 23, 0, 0, 1);
    vi.advanceTimersByTime(20_000);
    expect(fake.href(16)).toBe("/sudoku/favicon/I4-16.svg");
  });
});

describe("applyWeekdayFavicon", () => {
  it("leaves the document alone when the icon links are missing", () => {
    const doc = /** @type {Document} */ (
      /** @type {unknown} */ ({
        querySelector() {
          return null;
        },
      })
    );
    expect(() => applyWeekdayFavicon(doc, new Date(2026, 9, 25), "/sudoku/")).not.toThrow();
  });
});
