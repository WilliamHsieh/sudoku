// Journal loading, the timer, and stored solved state.
import { test, expect } from "@playwright/test";
import { cell, expectValue, solve } from "./helpers.js";

const DATE = "2025-06-01";
const EASY = "159230000800014700400500310060102578002083000980040006005000823700306005093000067";
const NOW = new Date("2025-06-15T12:00:00");

const day = (page, dateStr) => page.locator(`.dgrid .day[data-d="${dateStr}"]`);

/** @param {import('@playwright/test').Page} page */
async function loadFromJournal(page, dateStr, difficulty) {
  const label = difficulty[0].toUpperCase() + difficulty.slice(1);
  await day(page, dateStr).click();
  await expect(page.locator(".ctx h2")).toContainText(/June 1/);
  await page
    .locator(".ctx .prow")
    .filter({ hasText: label })
    .getByRole("button", { name: /Start|Resume/ })
    .click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.goto("./");
  await page.clock.pauseAt(new Date(NOW.getTime() + 60_000));
});

test("opens on the journal for the current month", async ({ page }) => {
  await expect(page.locator(".dmhead h2")).toHaveText(/June\s+2025/);
  await expect(page.locator(".dgrid .day.is-latest .n")).toHaveText("15");
  await expect(page.getByRole("button", { name: /^Play$/ })).toBeVisible();
  await expect(page.locator(".dbtn")).toHaveCount(0);
  await expect(page.locator(".board")).toHaveCount(0);
  await expect(page.locator(".timer")).toHaveCount(0);
});

test("picking a date and difficulty loads that puzzle as givens with the timer reset", async ({
  page,
}) => {
  await loadFromJournal(page, DATE, "easy");
  await expect(page.locator(".dbtn")).toBeVisible();
  await expect(page.locator("#header-time .time")).toHaveText("0:00");
  for (let i = 0; i < 81; i++) await expectValue(page, i, Number(EASY[i]));
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 1); // given
});

test("the timer counts seconds while playing and restarts on a new puzzle", async ({ page }) => {
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect(page.locator("#header-time .time")).toHaveText("0:00");
  await page.clock.runFor(3_000);
  await expect(page.locator("#header-time .time")).toHaveText("0:03");
  await page.clock.runFor(62_000);
  await expect(page.locator("#header-time .time")).toHaveText("1:05");

  await page.locator(".dbtn").click();
  await loadFromJournal(page, DATE, "medium");
  await expect(page.locator("#header-time .time")).toHaveText("0:00");
  await page.clock.runFor(2_000);
  await expect(page.locator("#header-time .time")).toHaveText("0:02");
});

test("solving a journal puzzle shows the success card and stores it in localStorage", async ({
  page,
}) => {
  await loadFromJournal(page, DATE, "easy");
  await page.clock.runFor(65_000);
  await expect(page.locator("#header-time .time")).toHaveText("1:05");

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

  await page.clock.runFor(5_000);
  await expect(page.locator("#header-time .time")).toHaveText("1:05");
  await page.keyboard.press("Escape");
  await expect(page.locator(".success-card")).toHaveCount(0);

  await page.reload();
  await expect(day(page, DATE)).toHaveAttribute("aria-label", /Easy solved/);
  await day(page, DATE).click();
  await expect(page.locator(".ctx .prow").filter({ hasText: "Easy" })).toContainText("1:05");
});
