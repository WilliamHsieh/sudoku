import { describe, it, expect } from "vitest";
import {
  COACH_OK,
  COACH_ROWS,
  COACH_TITLE,
  HINT_IDLE,
  HINT_LEGACY,
  LABEL_HOLD,
  OPT_TAP_SUB,
  OPT_TAP_TITLE,
  TOAST_GIVEN,
  TOAST_NO_CELL,
  ariaEnter,
  ariaLocked,
  ariaShow,
  hintModel,
  toastBlocked,
  toastLockedCell,
} from "./keypad-copy.js";

describe("hint line", () => {
  it("idles with the four gestures", () => {
    expect(hintModel({ legacy: false, locked: 0, shown: 0, placed: 0 })).toEqual({
      kind: "plain",
      text: HINT_IDLE,
    });
  });

  it("counts the cells still missing the shown digit", () => {
    expect(hintModel({ legacy: false, locked: 0, shown: 5, placed: 5 })).toEqual({
      kind: "rich",
      lead: "5",
      rest: "· 4 left · Double-tap fills · Swipe down locks",
    });
  });

  it("says when all nine are placed", () => {
    const hint = hintModel({ legacy: false, locked: 0, shown: 5, placed: 9 });
    expect(hint.kind).toBe("rich");
    if (hint.kind === "rich") expect(hint.rest).toContain("all placed");
  });

  it("switches to the lock status, and legacy mode keeps the master hint", () => {
    expect(hintModel({ legacy: false, locked: 5, shown: 5, placed: 4 })).toEqual({
      kind: "rich",
      lead: "5 locked",
      rest: "· Tap empty cells to toggle · Tap 5 to unlock",
    });
    expect(hintModel({ legacy: true, locked: 0, shown: 5, placed: 2 })).toEqual({
      kind: "plain",
      text: HINT_LEGACY,
    });
  });
});

describe("other keypad copy", () => {
  it("ships the English strings the designer signs off", () => {
    expect(HINT_IDLE).toBe("Tap = show · Double-tap = fill · Swipe ↑ candidate, ↓ lock");
    expect(LABEL_HOLD).toBe("Tap cells: candidate");
    expect(OPT_TAP_TITLE).toBe("Tap to fill");
    expect(OPT_TAP_SUB).toBe("Off: tap shows, double-tap fills");
    expect(COACH_TITLE).toBe("New way to use the keys");
    expect(COACH_OK).toBe("Got it");
    expect(COACH_ROWS).toEqual([
      { label: "Tap", body: "Highlights this digit and its candidates" },
      { label: "Double-tap", body: "Fills the selected cell" },
      { label: "Swipe down", body: "Locks it; tap empty cells to toggle candidates" },
    ]);
    expect(toastLockedCell(5)).toBe("5 locked — tap an empty cell");
    expect(toastBlocked(5)).toBe("Can't place 5 — already in row, column or box");
    expect(TOAST_NO_CELL).toBe("Select a cell, then double-tap");
    expect(TOAST_GIVEN).toBe("Given digits can't change");
    expect(ariaLocked(5)).toBe("Digit 5, locked: tap empty cells to toggle, tap again to unlock");
    expect(ariaShow(5)).toBe("Digit 5: tap to show, double-tap to fill");
    expect(ariaEnter(4)).toBe("Enter 4");
  });
});
