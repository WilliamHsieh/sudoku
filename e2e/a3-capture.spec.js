import { test, expect } from "@playwright/test";

test.use({ video: "on" });

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
for (const device of [
  { name: "desktop-1280x900", viewport: { width: 1280, height: 900 }, mobile: false },
  { name: "mobile-emulation-402x874", viewport: { width: 402, height: 874 }, mobile: true },
]) {
  test.describe(device.name, () => {
    test.use({
      viewport: device.viewport,
      isMobile: device.mobile,
      hasTouch: device.mobile,
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    test("A3 real interaction recording", async ({ page }) => {
      test.setTimeout(60000);
      const hold = () => page.waitForTimeout(1000);
      await page.goto("./");
      await hold();
      await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Enter 5", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Enter blank", exact: true }).click();
      await page.getByRole("button", { name: "Enter 3", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Clear all givens", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Puzzle link or 81 digits" });
      await input.fill("123");
      await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeDisabled();
      await hold();
      await input.fill(PUZZLE);
      await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeEnabled();
      await hold();
      await page.getByRole("button", { name: "Share puzzle", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Puzzle string (81 digits)" })).toHaveValue(
        PUZZLE
      );
      await hold();
      await page.getByRole("button", { name: "Close copy dialog" }).click();
      await hold();
      await page.getByRole("button", { name: "Back to daily puzzles" }).click();
      await hold();
      await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
      await hold();
      await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
      await expect(page.locator(".board > .cell.given")).toHaveCount(30);
      await hold();
    });
  });
}
