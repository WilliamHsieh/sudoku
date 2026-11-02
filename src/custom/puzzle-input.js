/**
 * @typedef {{ok: true, puzzle: string, source: 'digits' | 'url'} |
 *   {ok: false, error: string}} PuzzleInputResult
 */

/**
 * Parse a complete import. Partial drafts and Sudoku validity belong to the editor.
 * @param {unknown} input
 * @returns {PuzzleInputResult}
 */
export function parsePuzzleInput(input) {
  if (typeof input !== "string") {
    return { ok: false, error: "Paste a puzzle link or 81 digits." };
  }

  const puzzle = input.replace(/\s/g, "").replace(/\./g, "0");
  if (/^[0-9]*$/.test(puzzle)) {
    return puzzle.length === 81
      ? { ok: true, puzzle, source: "digits" }
      : { ok: false, error: "Enter exactly 81 digits, using 0 or . for empty cells." };
  }

  // URL parsing can silently remove literal tabs/newlines and trailing spaces.
  // Reject them before parsing so a malformed q never becomes a valid puzzle.
  if (!/^https?:\/\//i.test(input) || /\s/.test(input)) {
    return { ok: false, error: "Paste an HTTP(S) puzzle link or 81 digits." };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "This puzzle link is not a valid URL." };
  }

  const values = url.searchParams.getAll("q");
  if (values.length !== 1) {
    return { ok: false, error: "The puzzle link must contain exactly one q parameter." };
  }
  if (!/^[0-9]{81}$/.test(values[0])) {
    return { ok: false, error: "The link's q parameter must contain exactly 81 digits (0–9)." };
  }
  return { ok: true, puzzle: values[0], source: "url" };
}
