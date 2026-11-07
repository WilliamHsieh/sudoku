import { grade } from "./grade.js";

/** @param {string} digits */
export async function puzzleId(digits) {
  const bytes = new TextEncoder().encode(digits);
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", bytes));
  return [...hash].map((n) => n.toString(16).padStart(2, "0")).join("");
}
/** @param {string} rating */
export function parseRating(rating) {
  // The source right-aligns one-digit ratings (" 1.2"). No float conversion.
  if (!/^ ?\d{1,2}\.\d$/.test(rating)) throw new Error("Invalid rating format");
  const [whole, tenth] = rating.trim().split(".");
  const value = Number(whole) * 10 + Number(tenth);
  grade(value);
  return value;
}
/** Validate digit format and conflicting givens; solving/technique analysis is not grading.
 * @param {string} digits */
export function validateDigits(digits) {
  if (typeof digits !== "string" || !/^[0-9]{81}$/.test(digits))
    throw new Error("Invalid board digits");
  for (let unit = 0; unit < 9; unit++) {
    for (const indexes of [
      Array.from({ length: 9 }, (_, i) => unit * 9 + i),
      Array.from({ length: 9 }, (_, i) => i * 9 + unit),
      Array.from(
        { length: 9 },
        (_, i) => Math.floor(unit / 3) * 27 + (unit % 3) * 3 + Math.floor(i / 3) * 9 + (i % 3)
      ),
    ]) {
      const values = indexes.map((i) => digits[i]).filter((v) => v !== "0");
      if (new Set(values).size !== values.length) throw new Error("Conflicting givens");
    }
  }
}
/** A line may include its Unix newline. Errors are values so a batch can continue.
 * @param {string} line @param {string} [sourceBucket]
 * @returns {Promise<{ok: true, puzzle: import('./types.js').Puzzle}|{ok: false, error: string}>} */
export async function parseLine(line, sourceBucket) {
  try {
    const text = line.endsWith("\n") ? line.slice(0, -1) : line;
    if (text.length !== 99 || text[12] !== " " || text[94] !== " ")
      throw new Error("Invalid line length or separators");
    const sourceHash = text.slice(0, 12);
    const digits = text.slice(13, 94);
    validateDigits(digits);
    const ratingTenths = parseRating(text.slice(95));
    const id = await puzzleId(digits);
    if (!/^[a-f0-9]{12}$/.test(sourceHash) || sourceHash !== id.slice(0, 12))
      throw new Error("Hash mismatch");
    return {
      ok: true,
      puzzle: {
        id,
        sourceHash,
        digits,
        ratingTenths,
        level: grade(ratingTenths),
        ...(sourceBucket ? { sourceBucket } : {}),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid line" };
  }
}
