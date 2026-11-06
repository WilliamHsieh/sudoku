import { expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";
import {
  newGame,
  setAnswer,
  setNotesMode,
  toggleCandidate,
  computedCandidates,
} from "../src/game/game.js";
import { maskDigits } from "../src/game/board.js";
import { toSnapshot } from "../src/game/snapshot.js";
import { solve } from "./helpers.js";
export const REPLAY_DATE = "2026-10-31";
export const replayPuzzle = puzzleData[REPLAY_DATE].easy;
export const replayAnswer = solve(replayPuzzle);
export function replayEntry(date = REPLAY_DATE, diff = "easy", elapsed = 133, pct = 38) {
  const puzzle = puzzleData[date][diff],
    answer = solve(puzzle);
  let state = newGame(puzzle, { notesMode: "auto" });
  const blanks = [...puzzle].flatMap((c, i) => (c === "0" ? [i] : []));
  const filled = Math.round((blanks.length * pct) / 100);
  for (const i of blanks.slice(0, filled)) state = setAnswer(state, i, Number(answer[i])).state;
  const noteCell = blanks[filled],
    digit = maskDigits(computedCandidates(state, noteCell))[0];
  state = setNotesMode(state, "manual");
  state = toggleCandidate(state, noteCell, digit).state;
  return {
    elapsed,
    filled,
    empty: blanks.length,
    updatedAt: new Date(`${date}T21:20:00`).getTime(),
    snapshot: toSnapshot(state),
  };
}
export async function seedReplay(page, { withReplay = false, otherReplay = false } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-31T22:00:00"));
  const solved = {
    [REPLAY_DATE]: {
      easy: { completed: true, time: 402, timestamp: new Date("2026-10-31T21:14:00").getTime() },
    },
    "2026-10-30": {
      easy: { completed: true, time: 499, timestamp: new Date("2026-10-30T21:00:00").getTime() },
    },
  };
  const replays = {};
  if (withReplay) replays[REPLAY_DATE] = { easy: replayEntry() };
  if (otherReplay) {
    solved["2026-10-24"] = {
      medium: { completed: true, time: 785, timestamp: new Date("2026-10-24T21:00:00").getTime() },
    };
    replays["2026-10-24"] = { medium: replayEntry("2026-10-24", "medium", 185, 22) };
  }
  await page.addInitScript(
    ({ solved, replays }) => {
      if (localStorage.getItem("pr2-r2-fixture")) return;
      localStorage.setItem("pr2-r2-fixture", "1");
      localStorage.setItem("sudoku-keypad-coach", "1");
      localStorage.setItem("sudoku-solved", JSON.stringify(solved));
      localStorage.setItem("sudoku-progress", "{}");
      localStorage.setItem("sudoku-replay-progress", JSON.stringify(replays));
    },
    { solved, replays }
  );
  await page.goto("./");
}
export async function showSolvedRow(page, time = "6:42") {
  const row = page.getByRole("button", { name: `View solved easy puzzle, ${time}` }).first();
  if (page.viewportSize().width < 600 && !(await row.isVisible()))
    await page.getByRole("button", { name: /Latest puzzles,/ }).click();
  await expect(row).toBeVisible();
  return row;
}
export async function openReplayDay(page) {
  await (await showSolvedRow(page)).click();
  await expect(page.locator(".sv-view-panel")).toBeVisible();
}
export async function startReplay(page) {
  await page.locator("#sv-replay").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.locator(".board .cell.user")).toHaveCount(0);
}
export async function readReplayStorage(page) {
  return page.evaluate(() => ({
    solved: localStorage.getItem("sudoku-solved"),
    replay: localStorage.getItem("sudoku-replay-progress"),
    progress: localStorage.getItem("sudoku-progress"),
  }));
}
