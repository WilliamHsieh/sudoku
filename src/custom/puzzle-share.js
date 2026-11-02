/** @typedef {{status: 'shared' | 'copied' | 'cancelled' | 'failed', error?: string}} ShareResult */

/**
 * Build a link from canonical givens, independent of the current editor URL.
 * @param {string} puzzle
 * @param {string | URL} baseUrl Absolute HTTP(S) URL; its pathname is preserved.
 * @returns {string}
 * @throws {Error} If the givens or base URL are invalid.
 */
export function createPuzzleLink(puzzle, baseUrl) {
  if (typeof puzzle !== "string" || !/^[0-9]{81}$/.test(puzzle)) {
    throw new Error("The puzzle must contain exactly 81 digits (0–9).");
  }

  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("The base URL must be an absolute HTTP(S) URL.");
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new Error("The base URL must be an absolute HTTP(S) URL.");
  }

  // Using origin also omits any credentials from the supplied URL.
  const link = new URL(base.origin);
  link.pathname = base.pathname;
  link.searchParams.set("q", puzzle);
  return link.href;
}

/** @param {string} text @param {boolean} [digits] @returns {Promise<ShareResult>} */
async function copyText(text, digits = false) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
      return {
        status: "failed",
        error: digits
          ? "Select the numbers and copy them manually."
          : "Clipboard access is unavailable. Copy the puzzle link manually.",
      };
    }
    await navigator.clipboard.writeText(text);
    return { status: "copied" };
  } catch {
    return {
      status: "failed",
      error: digits
        ? "Select the numbers and copy them manually."
        : "Could not copy the puzzle link. Copy it manually instead.",
    };
  }
}

/** @param {string} puzzle @returns {Promise<ShareResult>} */
export function copyPuzzleString(puzzle) {
  if (typeof puzzle !== "string" || !/^[0-9]{81}$/.test(puzzle)) {
    return Promise.resolve({
      status: "failed",
      error: "The puzzle must contain exactly 81 digits (0–9).",
    });
  }
  return copyText(puzzle, true);
}

/** @param {unknown} error @returns {ShareResult} */
function invalidLink(error) {
  return {
    status: "failed",
    error: error instanceof Error ? error.message : "Could not create the puzzle link.",
  };
}

/**
 * Call directly from a click handler; no browser APIs are used before this call.
 * Cancellation leaves the clipboard untouched. Other share failures try copying.
 * @param {string} puzzle
 * @param {string | URL} baseUrl
 * @returns {Promise<ShareResult>}
 */
export async function sharePuzzle(puzzle, baseUrl) {
  let link;
  try {
    link = createPuzzleLink(puzzle, baseUrl);
  } catch (error) {
    return invalidLink(error);
  }

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const data = { title: "Sudoku puzzle", url: link };
      if (typeof navigator.canShare !== "function" || navigator.canShare(data)) {
        // Do not await anything before invoking share: preserve user activation.
        await navigator.share(data);
        return { status: "shared" };
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      return { status: "cancelled" };
    }
  }
  return copyText(link);
}

/**
 * Call directly from a click handler to copy only the canonical puzzle link.
 * @param {string} puzzle
 * @param {string | URL} baseUrl
 * @returns {Promise<ShareResult>}
 */
export async function copyPuzzleLink(puzzle, baseUrl) {
  let link;
  try {
    link = createPuzzleLink(puzzle, baseUrl);
  } catch (error) {
    return invalidLink(error);
  }
  return copyText(link);
}
