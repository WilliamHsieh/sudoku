import { expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";
import { newGame, setAnswer } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";
import { solve } from "./helpers.js";
export const TODAY = "2026-11-01";
export const PAST = "2026-05-10";
/** Final-decision fixtures use real puzzle progress and the production solve path. */
export async function prepareDecision(
  page,
  { state = "normal", custom = false, allToday = false, appearance = "system" } = {}
) {
  const date = state === "dropped-facts" || state === "today-button" ? PAST : TODAY;
  const puzzle = puzzleData[date].easy;
  const solution = solve(puzzle);
  const empty = [...puzzle].flatMap((d, i) => (d === "0" ? [i] : []));
  const last = empty.at(-1);
  let board = newGame(puzzle, { notesMode: "auto" });
  for (const i of empty) if (i !== last) board = setAnswer(board, i, Number(solution[i])).state;
  const progress = custom
    ? {}
    : {
        [date]: {
          easy: {
            snapshot: toSnapshot(board),
            elapsed: 402,
            filled: empty.length - 1,
            empty: empty.length,
            updatedAt: 100,
          },
        },
      };
  const times =
    state === "new-best" ? [490, 490, 490] : state === "slower" ? [200, 250, 150] : [300, 580, 590];
  const solved =
    state === "dropped-facts" || state === "first-ever"
      ? {}
      : Object.fromEntries(
          ["2026-10-29", "2026-10-30", "2026-10-31"].map((d, i) => [
            d,
            { easy: { completed: true, time: times[i], timestamp: 100 } },
          ])
        );
  if (state === "today-button" || custom)
    solved[TODAY] = { easy: { completed: true, time: 500, timestamp: 100 } };
  if (state === "journal-primary" || allToday)
    solved[TODAY] = {
      easy: { completed: true, time: 500, timestamp: 100 },
      medium: { completed: true, time: 600, timestamp: 100 },
      hard: { completed: true, time: 700, timestamp: 100 },
    };
  if (!custom) delete solved[date]?.easy;
  await page.addInitScript(
    ({ progress, solved, appearance }) => {
      localStorage.setItem("sudoku-progress", JSON.stringify(progress));
      localStorage.setItem("sudoku-solved", JSON.stringify(solved));
      localStorage.setItem("sudoku-keypad-coach", "1");
      localStorage.setItem("sudoku-theme", appearance);
    },
    { progress, solved, appearance }
  );
  const customPuzzle = solution.slice(0, last) + "0" + solution.slice(last + 1);
  await page.goto(custom ? `./?q=${customPuzzle}&freeze&elapsed=402` : "./?freeze");
  if (!(await page.locator(".board > .cell").count()))
    await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await page
    .locator(".play")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return { date: custom ? null : date, last, digit: solution[last] };
}
export async function finishDecision(page, prepared) {
  await page.locator(`.cell[data-i="${prepared.last}"]`).click();
  await page.keyboard.press(prepared.digit);
  await expect(page.locator("#sv-h")).toBeFocused();
}
