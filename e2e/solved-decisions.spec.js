import { test, expect } from "@playwright/test";
import { NOW, seed, solved } from "./bank-fixture.js";
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
    // The game timer counts play with performance.now(), which seed()'s fixed
    // Date leaves running. Pause the page clock from Resume to the last digit so
    // a slow run can't add a real second to the saved 6:42.
    await page.clock.install({ time: NOW });
    const data = await seed(page, { count, priorTime });
    await page.getByRole("button", { name: /Unfinished/ }).click();
    await expect(page.getByRole("heading", { name: "Unfinished" })).toBeVisible();
    await page.clock.pauseAt(NOW + 3_600_000);
    await page
      .getByRole("button", { name: /Resume .* · L3/ })
      .last()
      .click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await page.locator(`.board > .cell[data-i="${data.last}"]`).click();
    await page.keyboard.press(String(data.digit));
    await page.clock.resume();
    await expect(page.locator(".sv-panel")).toBeVisible();
    await expect(page.locator(".sv-best")).toHaveCount(expected ? 1 : 0);
    if (priorTime === 200) await expect(page.locator(".sv-panel dd").first()).toHaveText("+3:22");
  });
test("custom solved panel has no stats, feelings or More custom row", async ({ page }) => {
  await solved(page, { custom: true });
  await expect(page.locator(".header .t1")).toHaveText("Custom #1");
  await expect(page.locator(".sv-panel dl")).toHaveCount(0);
  await expect(page.locator(".sv-feel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Custom puzzles" })).toBeVisible();
});
