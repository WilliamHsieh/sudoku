import { describe, expect, it } from "vitest";
import { draftBoardSide } from "./fit-draft-keypad.js";

describe("shared draft board fit", () => {
  it("uses the available width on a full phone viewport", () => {
    expect(draftBoardSide(354, 439)).toBe(354);
  });
  it("shrinks for shorter viewports without fractional CSS pixels", () => {
    expect(draftBoardSide(354, 251.8)).toBe(251);
  });
  it("keeps a usable board and lets the body scroll with a keyboard or error", () => {
    expect(draftBoardSide(354, 11)).toBe(160);
    expect(draftBoardSide(272, -48)).toBe(160);
  });
});
