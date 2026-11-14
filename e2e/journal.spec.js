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
    await expect(page.getByRole("button", { name: "NYT daily puzzles" })).toHaveCount(0);
  });
  test(`locked levels keep the chooser and give signed toasts (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 7 });
    await page.getByRole("button", { name: "Choose L1–L8" }).click();
    await page.getByRole("button", { name: /^L4 / }).click({ force: true });
    await expect(page.locator(".toast")).toHaveText("再解 3 題 L3，解鎖 L4");
    await expect(page.getByRole("group", { name: "篩選" })).toHaveCount(0);
    await page.getByRole("button", { name: /^L6 / }).click({ force: true });
    await expect(page.locator(".toast")).toHaveText("先解鎖 L4 和 L5，才能玩 L6");
  });
  test(`lists filter statuses and Next skips active boards (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 2 });
    await openList(page);
    await expect(page.getByRole("button", { name: "Next: 第 4 題" })).toBeVisible();
    await page.getByRole("button", { name: "已解", exact: true }).click();
    await expect(page.locator(".puzzles li")).toHaveCount(2);
    await page.getByRole("button", { name: "進行中", exact: true }).click();
    await expect(page.locator(".puzzles li")).toHaveCount(1);
    await expect(page.locator(".puzzles li")).toContainText("進行中 · 6:42");
    await page.getByRole("button", { name: "未解", exact: true }).click();
    await expect(page.locator(".puzzles li").first()).toContainText("未解");
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
test("opening a long level list keeps Next's row below the fixed filters", async ({ page }) => {
  await seed(page, { count: 35 });
  await openList(page);
  const next = page.getByRole("button", { name: /^第 37 題/ });
  const row = await next.boundingBox();
  const filters = await page.locator(".stick").boundingBox();
  expect(row.y).toBeGreaterThanOrEqual(filters.y + filters.height);
  expect(row.y + row.height).toBeLessThan(700);
});
test("home has no NYT daily puzzles entry", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
  await expect(page.getByRole("button", { name: "NYT daily puzzles" })).toHaveCount(0);
  await expect(page.getByText("NYT daily puzzles")).toHaveCount(0);
});

test("a fresh level uses the signed solved-empty state only for the solved filter", async ({
  page,
}) => {
  await seed(page, { highest: 4 });
  await openList(page, 4);
  await expect(page.locator(".stick .status")).toHaveText("剛解鎖");
  await expect(page.getByRole("button", { name: "Next: 第 1 題" })).toBeVisible();
  await page.getByRole("button", { name: "已解", exact: true }).click();
  await expect(page.locator(".empty")).toContainText("這一級還沒有解完的題");
  await page.getByRole("button", { name: "進行中", exact: true }).click();
  await expect(page.locator(".puzzles li")).toHaveCount(0);
  await expect(page.locator(".empty")).toHaveCount(0);
});
