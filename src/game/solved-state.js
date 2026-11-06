import { PEERS, parsePuzzle } from "./board.js";
import { newGame } from "./game.js";

/** Derive old and new solved boards from their givens. @param {string} puzzle */
export function solvedState(puzzle) {
  const grid = parsePuzzle(puzzle).slice();
  function search() {
    let cell = -1;
    let choices = [];
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const available = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
        (d) => !PEERS[i].some((p) => grid[p] === d)
      );
      if (!available.length) return false;
      if (cell < 0 || available.length < choices.length) {
        cell = i;
        choices = available;
      }
    }
    if (cell < 0) return true;
    for (const d of choices) {
      grid[cell] = d;
      if (search()) return true;
    }
    grid[cell] = 0;
    return false;
  }
  if (!search()) throw new Error("Cannot derive solved puzzle");
  const state = newGame(puzzle, { notesMode: "auto" });
  return { ...state, answers: grid.map((d, i) => (state.givens[i] ? 0 : d)) };
}
