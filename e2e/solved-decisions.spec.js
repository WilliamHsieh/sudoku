import { test, expect } from "@playwright/test";
import { solved } from "./bank-fixture.js";
for (const theme of ["light", "dark", "paper", "dim", "sage"])
  for (const width of [390, 1280]) {
    test(`solved theme ${theme}, ${width}: retained More and readable token colors`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((theme) => localStorage.setItem("sudoku-theme", theme), theme);
      await solved(page, { count: 1, mode: "easy" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator(".sv-panel dt")).toHaveCount(3);
      const ink = await page.locator(".sv-next").evaluate((el) => getComputedStyle(el).color);
      const bg = await page
        .locator(".sv-next")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(ink).not.toBe(bg);
      await expect(page.locator(".game-controls")).toHaveCount(0);
      await page.getByRole("button", { name: "More", exact: true }).click();
      await expect(page.locator("#opt-theme")).toBeVisible();
      await expect(page.locator("#opt-custom")).toHaveCount(0);
      await expect(page.locator("#opt-restart")).toHaveCount(0);
    });
  }
for (const [count, priorTime, expected] of [
  [1, 490, true],
  [1, 200, false],
  [0, 490, false],
])
  test(`New best follows prior record (${count},${priorTime})`, async ({ page }) => {
    await solved(page, { count, priorTime });
    await expect(page.locator(".sv-best")).toHaveCount(expected ? 1 : 0);
    if (priorTime === 200) await expect(page.locator(".sv-panel dd").first()).toHaveText("+3:22");
  });
test("custom solved panel has no stats, feelings or More custom row", async ({ page }) => {
  await solved(page, { custom: true });
  await expect(page.locator(".sv-panel dl")).toHaveCount(0);
  await expect(page.locator(".sv-feel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next: L3" })).toBeVisible();
});
