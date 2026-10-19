// Characterization tests: calendar loading, the timer and the stored solved state.
import { test, expect } from "@playwright/test";
import { cell, expectValue, solve } from "./helpers.js";

const DATE = "2025-06-01";
const EASY = "159230000800014700400500310060102578002083000980040006005000823700306005093000067";
const NOW = new Date("2025-06-15T12:00:00");

const day = (page, n) =>
  page
    .locator(".calendar-day")
    .filter({ has: page.locator(".day-number", { hasText: new RegExp(`^${n}$`) }) });

async function loadFromCalendar(page, n, difficulty) {
  await day(page, n).click();
  await expect(page.locator(".modal")).toContainText(`Choose a puzzle for ${DATE}`);
  await page.locator(`.difficulty-button.${difficulty}`).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto("./");
  await page.clock.pauseAt(new Date(NOW.getTime() + 60_000));
});

test("opens on the calendar for the current month", async ({ page }) => {
  await expect(page.locator(".calendar-header h2")).toHaveText("June 2025");
  await expect(page.locator(".calendar-day.today .day-number")).toHaveText("15");
  await expect(page.getByRole("button", { name: /Play/ })).toBeVisible();
  await expect(page.locator(".board")).toHaveCount(0);
  await expect(page.locator(".timer")).toHaveCount(0);
});

test("picking a date and difficulty loads that puzzle as givens with the timer reset", async ({
  page,
}) => {
  await loadFromCalendar(page, 1, "easy");
  await expect(page.getByRole("button", { name: /Calendar/ })).toBeVisible();
  await expect(page.locator(".timer .time")).toHaveText("0:00");
  for (let i = 0; i < 81; i++) await expectValue(page, i, Number(EASY[i]));
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 1); // given
});

test("the timer counts seconds while playing and restarts on a new puzzle", async ({ page }) => {
  await page.getByRole("button", { name: /Play/ }).click();
  await expect(page.locator(".timer .time")).toHaveText("0:00");
  await page.clock.runFor(3_000);
  await expect(page.locator(".timer .time")).toHaveText("0:03");
  await page.clock.runFor(62_000);
  await expect(page.locator(".timer .time")).toHaveText("1:05");

  await page.getByRole("button", { name: /Calendar/ }).click();
  await loadFromCalendar(page, 1, "medium");
  await expect(page.locator(".timer .time")).toHaveText("0:00");
  await page.clock.runFor(2_000);
  await expect(page.locator(".timer .time")).toHaveText("0:02");
});

test("solving a calendar puzzle shows the success card and stores it in localStorage", async ({
  page,
}) => {
  await loadFromCalendar(page, 1, "easy");
  await page.clock.runFor(65_000);
  await expect(page.locator(".timer .time")).toHaveText("1:05");

  const solution = solve(EASY);
  for (let i = 0; i < 81; i++) {
    if (EASY[i] !== "0") continue;
    await cell(page, i).click();
    await page.keyboard.press(solution[i]);
  }
  await expect(page.locator(".success-card")).toContainText("Puzzle Complete!");

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-solved")));
  expect(Object.keys(stored)).toEqual([DATE]);
  expect(Object.keys(stored[DATE])).toEqual(["easy"]);
  expect(stored[DATE].easy).toEqual({ completed: true, time: 65, timestamp: expect.any(Number) });

  // The timer stops once solved.
  await page.clock.runFor(5_000);
  await expect(page.locator(".timer .time")).toHaveText("1:05");
  await page.keyboard.press("Escape");
  await expect(page.locator(".success-card")).toHaveCount(0);

  // After a reload the calendar shows it as completed.
  await page.reload();
  await expect(day(page, 1).locator(".puzzle-dot.solved")).toHaveCount(1);
  await day(page, 1).click();
  await expect(page.locator(".difficulty-button.easy")).toHaveClass(/completed/);
  await expect(page.locator(".difficulty-button.easy")).toContainText("Solved in 1:05");
});
