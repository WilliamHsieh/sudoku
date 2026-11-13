/**
 * @typedef {{type: "text", text: string} | {type: "coordinate", text: string, cell: number}} CoordinateTextToken
 */

/**
 * Split hint prose into plain text and valid lowercase Sudoku cell references.
 * ASCII identifier boundaries reject partial matches such as r1c10 or xr1c1,
 * while Chinese prose and punctuation can sit directly beside a reference.
 * Every input character is retained; consumers render text, never HTML.
 * @param {string} text
 * @returns {CoordinateTextToken[]}
 */
export function tokenizeCoordinates(text) {
  /** @type {CoordinateTextToken[]} */
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(/(^|[^A-Za-z0-9_])(r([1-9])c([1-9]))(?![A-Za-z0-9_])/g)) {
    const start = match.index + match[1].length;
    if (start > cursor) tokens.push({ type: "text", text: text.slice(cursor, start) });
    tokens.push({
      type: "coordinate",
      text: match[2],
      cell: (Number(match[3]) - 1) * 9 + Number(match[4]) - 1,
    });
    cursor = start + match[2].length;
  }
  if (cursor < text.length) tokens.push({ type: "text", text: text.slice(cursor) });
  return tokens;
}

/**
 * Keep chip-only references reachable without repeating coordinates in prose.
 * Pass the effect only on the conclusion page, where it is visible.
 * @param {import('./hint.js').HintStage} stage
 * @param {string} [effect]
 */
export function supplementalCoordinates(stage, effect = "") {
  const mentioned = new Set(
    [stage.title, ...stage.description, effect].flatMap((text) =>
      tokenizeCoordinates(text).flatMap((token) =>
        token.type === "coordinate" ? [token.cell] : []
      )
    )
  );
  const missing = [...new Set(stage.coordinates)].filter((cell) => !mentioned.has(cell));
  return missing.length
    ? `另請查看 ${missing.map((cell) => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`).join("、")}。`
    : "";
}
