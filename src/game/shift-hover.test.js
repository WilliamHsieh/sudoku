import { describe, expect, it } from "vitest";
import { resolveShiftHover, slotFromPoint } from "./shift-hover.js";

const rect = { left: 10, top: 20, width: 90, height: 90 };

describe("resolveShiftHover", () => {
  it("is null unless Shift is down over a visible note in an empty cell", () => {
    const ok = { shift: true, cell: 0, slot: 1, filled: false, hasNote: true };
    expect(resolveShiftHover(ok)).toEqual({ cell: 0, slot: 1, d: 2 });
    expect(resolveShiftHover({ ...ok, shift: false })).toBeNull();
    expect(resolveShiftHover({ ...ok, cell: -1 })).toBeNull();
    expect(resolveShiftHover({ ...ok, slot: -1 })).toBeNull();
    expect(resolveShiftHover({ ...ok, filled: true })).toBeNull();
    expect(resolveShiftHover({ ...ok, hasNote: false })).toBeNull();
  });
});

describe("slotFromPoint", () => {
  it("maps the 3×3 grid like Opus slotAt and clamps to the cell", () => {
    expect(slotFromPoint(rect, 10 + 15, 20 + 15)).toBe(0);
    expect(slotFromPoint(rect, 10 + 45, 20 + 15)).toBe(1);
    expect(slotFromPoint(rect, 10 + 75, 20 + 75)).toBe(8);
    expect(slotFromPoint(rect, 9, 20 + 15)).toBe(0);
    expect(slotFromPoint(rect, 10 + 15, 20 + 90)).toBe(6);
    expect(slotFromPoint({ ...rect, width: 0 }, 15, 25)).toBe(-1);
  });
});
