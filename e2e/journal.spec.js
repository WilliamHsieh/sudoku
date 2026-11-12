// Replaces calendar layout/selection tests with the signed home and level navigation.
import { test, expect } from "@playwright/test";
import { seed, openList } from "./bank-fixture.js";
for (const width of [390, 1280]) {
  test(`home starts fresh and hides Unfinished at zero (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Unfinished/ })).toHaveCount(0);
    await expect(page.getByText("Journal", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Custom puzzle" })).toBeVisible();
  });
  test(`locked levels keep the chooser and give signed toasts (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 7 });
    await page.getByRole("button", { name: "Choose L1–L8" }).click();
    await page.getByRole("button", { name: /^L4 / }).click({ force: true });
    await expect(page.locator(".toast")).toHaveText("再解 3 題 L3，解鎖 L4");
    await expect(page.getByRole("tablist", { name: "篩選" })).toHaveCount(0);
    await page.getByRole("button", { name: /^L6 / }).click({ force: true });
    await expect(page.locator(".toast")).toHaveText("先解鎖 L4 和 L5，才能玩 L6");
  });
  test(`lists filter statuses and Next skips active boards (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 2 });
    await openList(page);
    await expect(page.getByRole("button", { name: "Next: 第 4 題" })).toBeVisible();
    await page.getByRole("tab", { name: "Solved 2" }).click();
    await expect(page.locator(".cd")).toHaveCount(2);
    await page.getByRole("tab", { name: "In progress 1" }).click();
    await expect(page.locator(".cd")).toHaveCount(1);
    await expect(page.locator(".cd")).toContainText("進行中 · 6:42");
    await page.getByRole("tab", { name: /^Unsolved / }).click();
    await expect(page.locator(".t").first()).toHaveText("4");
    await expect(page.locator(".t.done, .t.prog")).toHaveCount(0);
  });
}

test("cold start and all-open chooser show the signed status copy", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Choose L1–L8" }).click();
  await expect(page.locator(".status")).toHaveText("解 10 題 L3，解鎖 L4");
  await seed(page, { highest: 8 });
  await page.getByRole("button", { name: "Choose L1–L8" }).click();
  await expect(page.locator(".status")).toHaveText("L1–L8 都解鎖了");
  await expect(page.locator(".levels [aria-disabled=true]")).toHaveCount(0);
});
for (const count of [35, 120])
  test(`opening a level keeps the Next tile between the tabs and the dock (${count})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 667 });
    await seed(page, { count });
    await openList(page);
    await expect(page.locator(".t.next")).toHaveText(String(count + 2));
    await expect(async () => {
      const next = await page.locator(".t.next").boundingBox();
      const tabs = await page.locator(".d-top").boundingBox();
      const dock = await page.locator(".dock").boundingBox();
      expect(next.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
      expect(next.y + next.height).toBeLessThanOrEqual(dock.y);
    }).toPass();
  });
test("NYT remains playable and leaves a separate unfinished save", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "NYT daily puzzles", exact: true }).click();
  await page.getByLabel("Puzzle date").fill("2026-11-11");
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(page.locator(".header .t1")).toHaveText("NYT 2026-11-11 · Easy");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator(".bank-pages .back").click();
  await page.getByRole("button", { name: /Unfinished/ }).click();
  await expect(page.locator(".uf")).toContainText("NYT 2026-11-11 · Easy");
});

test("a fresh level shows the signed empty states on Solved and In progress", async ({ page }) => {
  await seed(page, { highest: 4 });
  await openList(page, 4);
  await expect(page.getByRole("button", { name: "Next: 第 1 題" })).toBeVisible();
  await expect(page.locator(".empty")).toHaveCount(0);
  await page.getByRole("tab", { name: "Solved 0" }).click();
  await expect(page.locator(".empty")).toContainText("這一級還沒有解完的題");
  await page.getByRole("tab", { name: "In progress 0" }).click();
  await expect(page.locator(".cd")).toHaveCount(0);
  await expect(page.locator(".empty")).toContainText("這一級還沒有進行中的題");
});
