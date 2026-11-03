import { describe, expect, it } from "vitest";
import { pasteBoardSide } from "./fit-draft-keypad.js";

describe("paste board fit", () => {
  it("uses the available width on a full phone viewport", () => {
    expect(pasteBoardSide(354, 439)).toBe(354);
  });
  it("shrinks for shorter viewports without fractional CSS pixels", () => {
    expect(pasteBoardSide(354, 251.8)).toBe(251);
  });
  it("keeps a usable board and lets the body scroll with a keyboard or error", () => {
    expect(pasteBoardSide(354, 11)).toBe(200);
    expect(pasteBoardSide(272, -48)).toBe(200);
  });
});
