import { afterEach, expect, it, vi } from "vitest";
import { saveLocal, flushLocal } from "./persistence.js";

afterEach(() => vi.unstubAllGlobals());
it("retains failed writes for retry and verifies the stored value", () => {
  const values = new Map();
  const setItem = vi.fn(
    /** @type {(key: string, value: string) => void} */ (
      () => {
        throw Error("quota");
      }
    )
  );
  vi.stubGlobal("localStorage", { setItem, getItem: (key) => values.get(key) ?? null });
  expect(saveLocal("sudoku-progress", "latest")).toBe(false);
  expect(flushLocal()).toBe(false);
  setItem.mockImplementation((key, value) => values.set(key, value));
  expect(flushLocal()).toBe(true);
  expect(values.get("sudoku-progress")).toBe("latest");
  setItem.mockImplementation(() => {});
  expect(saveLocal("sudoku-progress", "newer")).toBe(false);
  expect(flushLocal()).toBe(false);
  setItem.mockImplementation((key, value) => values.set(key, value));
  expect(flushLocal()).toBe(true);
});
