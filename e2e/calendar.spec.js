// Calendar dates are removed. Preserve puzzle loading, timers and persistence coverage.
import { test, expect } from "@playwright/test";
import { resumeTarget, finish } from "./bank-fixture.js";
test("personalized modes start new games and keep all previous saves", async ({ page }) => {
  await page.goto("./");
  for (const mode of ["Easy", "Medium", "Hard"]) {
    await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
    await expect(page.locator(".header .t1")).toHaveText(mode);
    await page.keyboard.press("j");
    await expect(page.locator(".board")).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Unfinished/ })).toContainText("3");
});
test("resume restores answers and clock, completion persists bank record", async ({ page }) => {
  const data = await resumeTarget(page);
  await expect(page.locator("[data-time]").first()).toContainText("6:42");
  await finish(page, data);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("sudoku-bank-records-v1")).events.some(
          (e) => e.type === "complete" && e.attemptId === "target"
        )
      )
    )
    .toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBeNull();
});
