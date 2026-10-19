// Board fixture for side-by-side shots. Only runs when `?shot=` is set.
// Same puzzle, answers and manual seeds as the PR6 mockup.
import { maskDigits } from "../game/board.js";
import { timer, timerRunning } from "../store.js";

export const SHOT_PUZZLE =
  "094000560200058790075900102402605009607020010000710605001092080080060200320001007";
export const SHOT_SOLUTION =
  "194273568263158794875946132412635879657829413938714625741592386589367241326481957";
const SHOT_ANSWERS = [0, 3, 12, 41, 45, 65, 71, 79];
const MANUAL_CELLS = [1, 2, 9, 10, 11, 18, 27, 28, 36, 37];

/**
 * @param {import("../game/game.svelte.js").createGame extends (...args: never) => infer R ? R : never} game
 * @param {boolean} manual
 */
export function applyShot(game, manual) {
  game.load(SHOT_PUZZLE);
  for (const i of SHOT_ANSWERS) game.fill(i, Number(SHOT_SOLUTION[i]));
  if (manual) {
    /** @type {Record<number, number[]>} */
    const seed = {};
    for (const i of MANUAL_CELLS) {
      if (game.value(i)) continue;
      seed[i] = maskDigits(game.notes(i)).slice(0, 3);
    }
    game.setNotesMode("manual");
    for (const [i, digits] of Object.entries(seed)) {
      for (const d of digits) game.toggleNote(Number(i), d);
    }
  }
  game.select(45);
  timer.set(12 * 60 + 47);
  timerRunning.set(false);
}
