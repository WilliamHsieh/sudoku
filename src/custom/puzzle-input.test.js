import { describe, expect, it } from "vitest";
import { parsePuzzleInput } from "./puzzle-input.js";

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const BASE = "https://example.com/sudoku/";

describe("parsePuzzleInput", () => {
  it.each([
    PUZZLE,
    PUZZLE.replace(/0/g, "."),
    ` \t${PUZZLE.match(/.{9}/g)?.join("\r\n")}\n`,
    PUZZLE.replace(/0/g, ".").split("").join("\u3000"),
  ])("normalizes a complete digit draft: %j", (input) => {
    expect(parsePuzzleInput(input)).toEqual({ ok: true, puzzle: PUZZLE, source: "digits" });
  });

  it.each([
    `${BASE}?q=${PUZZLE}`,
    `http://localhost:8000/sudoku/?q=${PUZZLE}`,
    `${BASE}?prototype=custom&q=${PUZZLE}&variant=A#review`,
    `${BASE}?q=${PUZZLE.replace("5", "%35")}`,
  ])("reads the single decoded q without changing its contents: %s", (input) => {
    expect(parsePuzzleInput(input)).toEqual({ ok: true, puzzle: PUZZLE, source: "url" });
  });

  it.each([
    null,
    undefined,
    123,
    "",
    " \n ",
    PUZZLE.slice(1),
    PUZZLE + "0",
    PUZZLE.replace("5", "x"),
    PUZZLE.replace("5", "５"),
    `Puzzle: ${PUZZLE}`,
    `/sudoku/?q=${PUZZLE}`,
    `//example.com/sudoku/?q=${PUZZLE}`,
    `ftp://example.com/?q=${PUZZLE}`,
    `javascript:${PUZZLE}`,
    `https:example.com/?q=${PUZZLE}`,
    `https://?q=${PUZZLE}`,
    `${BASE}${PUZZLE}`,
    `${BASE}#q=${PUZZLE}`,
    `${BASE}?other=${PUZZLE}`,
    `${BASE}?q=${PUZZLE}&q=${PUZZLE}`,
    `${BASE}?q=${PUZZLE}&%71=${PUZZLE}`,
    `${BASE}?q=`,
    `${BASE}?q=${PUZZLE.slice(1)}`,
    `${BASE}?q=${PUZZLE}0`,
    `${BASE}?q=${PUZZLE.replace(/0/g, ".")}`,
    `${BASE}?q=${PUZZLE.slice(0, 9)}%20${PUZZLE.slice(9)}`,
    `${BASE}?q=${PUZZLE.slice(0, 9)}+${PUZZLE.slice(9)}`,
    `${BASE}?q=${PUZZLE.slice(0, 9)}\n${PUZZLE.slice(9)}`,
    `${BASE}?q=${PUZZLE.slice(0, 9)}\t${PUZZLE.slice(9)}`,
    `${BASE}?q=${PUZZLE}%0A`,
    `${BASE}?q=${PUZZLE} `,
  ])("rejects an incomplete, ambiguous or malformed import: %j", (input) => {
    expect(parsePuzzleInput(input)).toEqual({ ok: false, error: expect.any(String) });
  });

  it("leaves conflict and solution checks to the editor", () => {
    expect(parsePuzzleInput("0".repeat(81))).toEqual({
      ok: true,
      puzzle: "0".repeat(81),
      source: "digits",
    });
    expect(parsePuzzleInput("1".repeat(81)).ok).toBe(true);
  });
});
