import { test, expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";
import { solve } from "./helpers.js";
const date = "2026-11-01";
const puzzle = puzzleData[date].easy;
const answer = solve(puzzle);
async function seed(page) {
  await page.clock.setFixedTime(new Date("2026-11-01T22:00:00"));
  await page.addInitScript(() => {
    if (localStorage.getItem("pr2-fixture")) return;
    localStorage.setItem("pr2-fixture", "1");
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem(
      "sudoku-solved",
      JSON.stringify({
        "2026-11-01": {
          easy: {
            completed: true,
            time: 402,
            timestamp: new Date("2026-11-01T21:14:00").getTime(),
          },
        },
        "2026-10-31": {
          easy: {
            completed: true,
            time: 578,
            timestamp: new Date("2026-10-31T21:00:00").getTime(),
          },
        },
      })
    );
  });
  await page.goto("./");
}
async function showRow(page, time = "6:42") {
  const row = page.getByRole("button", { name: `View solved easy puzzle, ${time}` }).first();
  if (!(await row.isVisible())) await page.getByRole("button", { name: /Latest puzzles,/ }).click();
  await expect(row).toBeVisible();
  return row;
}
async function openSolved(page) {
  await showRow(page);
  await page.getByRole("button", { name: "View solved easy puzzle, 6:42" }).first().click();
  await expect(page.locator(".sv-view-panel")).toBeVisible();
}
async function replay(page) {
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.locator(".board .cell.user")).toHaveCount(0);
}
for (const width of [390, 1280]) {
  test(`solved Journal is read-only, confirm traps focus and replay preserves records at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await seed(page);
    await openSolved(page);
    const saved = await page.evaluate(() => localStorage.getItem("sudoku-solved"));
    await expect(page.locator("#time-control")).toHaveAttribute(
      "aria-label",
      "Solved in 6:42 on November 1"
    );
    await expect(page.locator("#sv-h")).toHaveText("Solved Nov 1 at 9:14 PM");
    await expect(page.locator(".hero")).toHaveText("6:42");
    await expect(page.locator(".summary")).toHaveText("Easy · 2:56 faster than average");
    await expect(page.locator("#sv-rn")).toHaveText(
      "Your 6:42 stays saved until you finish a replay."
    );
    await expect(page.locator("#keypad, .game-controls, .sv-ring")).toHaveCount(0);
    const values = await page
      .locator(".cell")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-value")));
    for (const key of ["1", "ArrowRight", "Backspace", "Control+z", "p", "Tab"])
      await page.keyboard.press(key);
    await page.locator(".cell").first().dispatchEvent("click");
    expect(
      await page
        .locator(".cell")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-value")))
    ).toEqual(values);
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.locator("p")).toHaveText(
      "You'll start from a fresh board at 0:00. Your 6:42 stays saved, and is replaced only if you finish."
    );
    await expect(page.locator("header")).toHaveAttribute("inert", "");
    await expect(page.locator(".play")).toHaveAttribute("inert", "");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Replay" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#sv-replay")).toBeFocused();
    await page.locator("#sv-replay").click();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("#sv-replay")).toBeFocused();
    await replay(page);
    await expect(page.locator("[data-time]")).toHaveText("0:00");
    const first = puzzle.indexOf("0");
    await page.locator(`.cell[data-i="${first}"]`).click();
    await page.keyboard.press(answer[first]);
    expect(await page.evaluate(() => localStorage.getItem("sudoku-solved"))).toBe(saved);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("sudoku-replay-progress"))["2026-11-01"].easy.filled
      )
    ).toBe(1);
    await page.locator(".header .dbtn").click();
    await showRow(page);
    await expect(
      page.locator(".sblock .srow").filter({ hasText: "Easy" }).first().locator(".r.num")
    ).toHaveText(["1", "6:42", "6:42"]);
    await page.reload();
    await openSolved(page);
    await expect(page.locator(".hero")).toHaveText("6:42");
    expect(await page.evaluate(() => localStorage.getItem("sudoku-solved"))).toBe(saved);
    await replay(page);
    await expect(page.locator("[data-time]")).toHaveText("0:00");
    await page.locator(".header .dbtn").click();
    await page.getByRole("button", { name: "Back to game", exact: true }).click();
    await expect(page.locator(".hero")).toHaveText("6:42");
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await showRow(page);
  });
  test(`finished replay replaces time and Journal statistics at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await seed(page);
    await openSolved(page);
    await replay(page);
    await page.clock.install({ time: new Date("2026-11-01T22:00:00") });
    await page.clock.fastForward(330_000);
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] !== "0") continue;
      await page.locator(`.cell[data-i="${i}"]`).click();
      await page.keyboard.press(answer[i]);
    }
    await page.clock.runFor(1200);
    await expect(page.locator(".sv-panel")).toBeVisible();
    const timeText = await page.locator(".sv-time").innerText();
    const [minutes, seconds] = timeText.split(":").map(Number);
    const finishedTime = minutes * 60 + seconds;
    expect(finishedTime).toBeGreaterThanOrEqual(330);
    expect(finishedTime).toBeLessThan(345);
    await expect(page.locator(".sv-best")).toHaveText("New best");
    const solved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-solved")));
    expect(solved[date].easy.time).toBe(finishedTime);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-replay-progress")))
    ).toEqual({});
    await page.locator(".sv-journal").click();
    await page.clock.runFor(1500);
    await showRow(page, timeText);
    await expect(
      page.locator(".sblock .srow").filter({ hasText: "Easy" }).first().locator(".r.num")
    ).toHaveText(["1", timeText, timeText]);
    await expect(page.locator(".journal-view")).toContainText("Personal best");
  });
}
