import { test, expect } from "@playwright/test";
import { resumeTarget } from "./bank-fixture.js";
for (const width of [390, 1280]) {
  test(`home ignores all play shortcuts without changing saves (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await resumeTarget(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Unfinished" })).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem("sudoku-bank-saves-v1"));
    for (const key of [
      "1",
      "Control+z",
      "Control+y",
      "Shift+1",
      "Delete",
      "p",
      "Escape",
      "Enter",
      "[",
      "]",
      "t",
    ])
      await page.keyboard.press(key);
    expect(await page.evaluate(() => localStorage.getItem("sudoku-bank-saves-v1"))).toBe(before);
    await expect(page.locator(".board")).toHaveCount(0);
  });
  test(`fresh page remains silent through timer ticks (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install();
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
    await page.clock.runFor(10000);
    await expect(page.locator("#resume-status")).toBeEmpty();
    await expect(page.locator(".paused-cover")).toHaveCount(0);
  });
}
