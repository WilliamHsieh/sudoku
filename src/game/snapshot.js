// Serialisable form of a game in progress, for saving and restoring.
import { digitsMask, maskDigits, parsePuzzle } from "./board.js";

/**
 * Plain JSON. Note sets are digit strings per cell ('' = none, '139' = 1, 3, 9).
 * @typedef {Object} Snapshot
 * @property {1} version
 * @property {string} puzzle  the givens, 81 digits
 * @property {string} answers 81 digits, '0' = no answer
 * @property {import('./game.js').NotesMode} notesMode
 * @property {string[]} manualNotes 81 entries
 * @property {{ added: string[], removed: string[] }} autoOverrides 81 entries each
 */

/** @param {readonly number[]} masks */
const toDigitStrings = (masks) => masks.map((m) => maskDigits(m).join(""));

/** @param {unknown} list @param {string} name */
function fromDigitStrings(list, name) {
  if (
    !Array.isArray(list) ||
    list.length !== 81 ||
    !list.every((s) => typeof s === "string" && /^[1-9]*$/.test(s))
  ) {
    throw new Error(`snapshot ${name} must be 81 strings of digits 1-9`);
  }
  return list.map((s) => digitsMask([...s].map(Number)));
}

/** @param {import('./game.js').GameState} state @returns {Snapshot} */
export function toSnapshot(state) {
  return {
    version: 1,
    puzzle: state.givens.join(""),
    answers: state.answers.join(""),
    notesMode: state.notesMode,
    manualNotes: toDigitStrings(state.manualNotes),
    autoOverrides: {
      added: toDigitStrings(state.autoAdded),
      removed: toDigitStrings(state.autoRemoved),
    },
  };
}

/**
 * Restores a snapshot, validating it. Throws on anything malformed, including
 * an answer on a given cell.
 * @param {unknown} snapshot
 * @returns {import('./game.js').GameState}
 */
export function fromSnapshot(snapshot) {
  const s = /** @type {Partial<Snapshot> | null} */ (snapshot);
  if (!s || typeof s !== "object" || s.version !== 1) throw new Error("unsupported snapshot");
  const givens = parsePuzzle(/** @type {string} */ (s.puzzle));
  const answers = parsePuzzle(/** @type {string} */ (s.answers));
  if (answers.some((v, i) => v && givens[i]))
    throw new Error("snapshot has an answer on a given cell");
  // Version 1 saves used strings. Accept legacy boolean modes as well;
  // absent or unknown values use the app's new-puzzle default, Auto.
  const legacy = /** @type {{ auto?: unknown, notesMode?: unknown }} */ (s);
  const mode = legacy.notesMode ?? legacy.auto;
  const notesMode =
    mode === "tidy" ? "tidy" : mode === "manual" || mode === false ? "manual" : "auto";
  const o = s.autoOverrides;
  if (!o || typeof o !== "object") throw new Error("snapshot autoOverrides missing");
  return {
    givens,
    answers,
    notesMode,
    manualNotes: fromDigitStrings(s.manualNotes, "manualNotes"),
    autoAdded: fromDigitStrings(o.added, "autoOverrides.added"),
    autoRemoved: fromDigitStrings(o.removed, "autoOverrides.removed"),
  };
}
