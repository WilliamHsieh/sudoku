import { expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";
import { newGame, setAnswer, clearCell, singleCandidates } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";
import { solve } from "./helpers.js";
export const DATE = "2026-11-01";
export const solution = solve(puzzleData[DATE].easy);
export const blanks = [...puzzleData[DATE].easy].flatMap((c, i) => (c === "0" ? [i] : []));
/** Seed real dated progress so UI and evidence use production data paths. */
export async function prepareSolved(
  page,
  {
    autofill = false,
    freeze = true,
    lastToday = false,
    resumeDate = "2026-05-10",
    date = DATE,
  } = {}
) {
  // Isolate the fixture from later daily-puzzle additions.
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
  const answer = solve(puzzleData[date].easy);
  const editable = [...puzzleData[date].easy].flatMap((c, i) => (c === "0" ? [i] : []));
  let state = newGame(puzzleData[date].easy, { notesMode: "auto" });
  for (const i of editable) state = setAnswer(state, i, Number(answer[i])).state;
  const remaining = [];
  for (const i of [...editable].reverse()) {
    const next = clearCell(state, i).state;
    if (!autofill && remaining.length) break;
    if (singleCandidates(next).length === remaining.length + 1) {
      state = next;
      remaining.push(i);
    }
  }
  remaining.sort((a, b) => a - b);
  const progress = {
    [date]: {
      easy: {
        snapshot: toSnapshot(state),
        elapsed: 402,
        filled: editable.length - remaining.length,
        empty: editable.length,
        updatedAt: 100,
      },
    },
  };
  const solved = Object.fromEntries(
    ["2026-10-29", "2026-10-30", "2026-10-31"].map((d, i) => [
      d,
      { easy: { completed: true, time: [300, 580, 590][i], timestamp: 100 } },
    ])
  );
  if (lastToday) {
    solved[date] = {
      medium: { completed: true, time: 500, timestamp: 100 },
      hard: { completed: true, time: 600, timestamp: 100 },
    };
    const unfinished = puzzleData[resumeDate].medium;
    const first = unfinished.indexOf("0");
    const saved = setAnswer(newGame(unfinished), first, Number(solve(unfinished)[first])).state;
    progress[resumeDate] = {
      medium: {
        snapshot: toSnapshot(saved),
        elapsed: 100,
        filled: 1,
        empty: [...unfinished].filter((d) => d === "0").length,
        updatedAt: 90,
      },
    };
  }
  await page.addInitScript(
    ({ progress, solved }) => {
      localStorage.setItem("sudoku-progress", JSON.stringify(progress));
      localStorage.setItem("sudoku-solved", JSON.stringify(solved));
      localStorage.setItem("sudoku-keypad-coach", "1");
    },
    { progress, solved }
  );
  await page.goto(`./${freeze ? "?freeze" : ""}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await page
    .locator(".play")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return remaining;
}
export async function finishSolved(page) {
  const i = blanks.at(-1);
  await page.locator(`.cell[data-i="${i}"]`).click();
  await page.keyboard.press(solution[i]);
}
