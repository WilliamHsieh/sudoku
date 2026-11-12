import { test, expect } from "@playwright/test";
import { openBoard, cell, expectValue } from "./helpers.js";
import { NOW, fixture, resumeTarget, solved } from "./bank-fixture.js";
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
  // Easy/Medium/Hard hide the puzzle level while playing; the solved panel reveals it.
  const startDay = (page) => page.locator(mobile ? ".t1 .short-date" : ".t1 .full-date");
  const startDayText = mobile ? "Wed, Nov 11" : "Wednesday, November 11";
  test("E/M/H header shows start day and mode, not the level; timer keeps its size", async ({
    page,
  }) => {
    await resumeTarget(page, { mode: "medium", level: 3, time: 7425 });
    await expect(startDay(page)).toBeVisible();
    await expect(startDay(page)).toHaveText(startDayText);
    await expect(page.locator(".t2")).toHaveText("Medium");
    await expect(page.locator(".t2 svg.dg")).toBeVisible();
    await expect(page.locator(".header")).not.toContainText("L3");
    await expect(page.locator(".header")).not.toContainText("魚形與翼形");
    await expect(page.locator("#header-time")).toHaveText("123:45");
    const box = await page.locator("#time-control").boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
  test("resuming on a later day still shows the day the puzzle was started", async ({ page }) => {
    const data = await fixture({ mode: "hard", level: 3 });
    await page.clock.setFixedTime(NOW + 2 * 86400000);
    await page.addInitScript((data) => {
      if (!sessionStorage.getItem("bank-seeded")) {
        for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
        sessionStorage.setItem("bank-seeded", "1");
      }
      localStorage.setItem("sudoku-keypad-coach", "1");
    }, data.storage);
    await page.goto("./");
    await page.getByRole("button", { name: /Unfinished/ }).click();
    await page.getByRole("button", { name: /Resume .* · Hard/ }).click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expect(startDay(page)).toHaveText(startDayText);
    await expect(page.locator(".t2")).toHaveText("Hard");
  });
  test("solving keeps the header unchanged; only the solved panel reveals the level", async ({
    page,
  }) => {
    await solved(page, { mode: "hard", level: 1 });
    await expect(startDay(page)).toHaveText(startDayText);
    await expect(page.locator(".t2")).toHaveText("Hard");
    await expect(page.locator(".header")).not.toContainText("L1");
    await expect(page.locator(".header")).not.toContainText("基礎定位");
    await expect(page.locator(".sv-panel")).toContainText("puzzle level");
    await expect(page.locator(".sv-panel")).toContainText("L1");
  });
  test("L1–L8 header keeps the level title and technique name", async ({ page }) => {
    await resumeTarget(page, { level: 3 });
    await expect(page.locator(".t1")).toHaveText("L3");
    await expect(page.locator(".t2")).toHaveText("魚形與翼形");
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
