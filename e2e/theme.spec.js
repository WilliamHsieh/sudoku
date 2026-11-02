import { test, expect } from "@playwright/test";
import { cell, openBoard, readBoardRects } from "./helpers.js";

test.use({ colorScheme: "light", reducedMotion: "reduce" });

const appearance = (page) => page.getByRole("combobox", { name: /Appearance/ });

async function openAppearance(page) {
  await page.locator("[data-more]").filter({ visible: true }).click();
  await expect(appearance(page)).toBeVisible();
}

for (const width of [390, 1280]) {
  test.describe(`appearance at ${width}`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("switches instantly, keeps the puzzle and layout, and remembers the selection", async ({
      page,
    }) => {
      await openBoard(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await cell(page, 0).click();
      await page.keyboard.press("4");
      const before = await readBoardRects(page);
      await openAppearance(page);
      await expect(appearance(page)).toHaveValue("system");
      await appearance(page).selectOption("dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#191b1f");
      await expect(cell(page, 0).locator(".pen-box")).toHaveText("4");
      expect(await readBoardRects(page)).toEqual(before);
      expect(await page.evaluate(() => localStorage.getItem("sudoku-theme"))).toBe("dark");
      await openBoard(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await openAppearance(page);
      await expect(appearance(page)).toHaveValue("dark");
      await appearance(page).selectOption("light");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f5f4f0");
      await expect(page.locator(".board")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    });

    test("follows system changes only while System is selected", async ({ page }) => {
      await openBoard(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await openAppearance(page);
      await appearance(page).selectOption("dark");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.emulateMedia({ colorScheme: "light" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await appearance(page).selectOption("system");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    });
  });
}

test("applies a saved theme before the application JavaScript loads", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sudoku-theme", "dark"));
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.goto("./");
  await expect(page.locator("#app")).toBeEmpty();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(25, 27, 31)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#191b1f");
});

test("switches for this session when preference storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "sudoku-theme") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "sudoku-theme") throw new DOMException("Blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  await openBoard(page);
  await openAppearance(page);
  await appearance(page).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("synchronizes a choice across tabs", async ({ page, context }) => {
  await openBoard(page);
  const other = await context.newPage();
  await other.goto("./");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await page.bringToFront();
  await openAppearance(page);
  await appearance(page).selectOption("dark");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance(page).selectOption("system");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await other.close();
});
