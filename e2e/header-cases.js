import { test, expect } from "@playwright/test";
import { openBoard, cell, expectValue } from "./helpers.js";
import { resumeTarget } from "./bank-fixture.js";
export function headerCases(mobile) {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
  });
  test("back saves; exact Resume preserves this document undo history", async ({ page }) => {
    await openBoard(page);
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
    await page.getByRole("button", { name: /Unfinished/ }).click();
    await page.getByRole("button", { name: /Resume/ }).click();
    await expectValue(page, 0, 4);
    await page.keyboard.press("Control+z");
    await expectValue(page, 0, 0);
  });
  test("new header shows mode and level, timer retains its target size", async ({ page }) => {
    await resumeTarget(page, { mode: "medium", level: 3, time: 7425 });
    await expect(page.locator(".t1")).toHaveText("Medium");
    await expect(page.locator(".t2")).toHaveText("L3 · 魚形與翼形");
    await expect(page.locator("#header-time")).toHaveText("123:45");
    const box = await page.locator("#time-control").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
  test("custom header and pause keep existing controls", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".t1")).toHaveText("Custom 1");
    await expect(page.locator(".t2")).toHaveCount(0);
    await page.keyboard.press("p");
    await expect(page.locator("#resume")).toBeVisible();
    await page.keyboard.press("p");
    await expect(page.locator("#time-control")).toHaveAccessibleName("Pause");
  });
}
