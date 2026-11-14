import { test, expect } from "@playwright/test";
import { seed, resumeTarget } from "./bank-fixture.js";
for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`Unfinished Resume restores exact board and elapsed (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    const data = await resumeTarget(page);
    await expect(page.locator(`[data-i="${data.last}"]`)).toHaveAttribute("data-value", "");
    await expect(page.locator("[data-time]").first()).toContainText("6:42");
    await expect(page.locator(".bank-pages")).toHaveCount(0);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });
  test(`double Resume creates no second attempt (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await seed(page);
    await page.getByRole("button", { name: /Unfinished/ }).click();
    await page.getByRole("button", { name: /Resume/ }).evaluate((el) => {
      el.click();
      el.click();
    });
    await expect(page.locator(".board")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("sudoku-bank-records-v1")).events.filter(
            (e) => e.type === "start"
          ).length
      )
    ).toBe(1);
  });
}
test("custom games are separate resumable slots and legacy saves remain untouched", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("sudoku-progress", '{"legacy":{}}'));
  await seed(page, { custom: true });
  await expect(page.getByRole("button", { name: /Unfinished/ })).toContainText("1");
  await page.getByRole("button", { name: /Unfinished/ }).click();
  await page.getByRole("button", { name: /Resume .*Custom puzzle/ }).click();
  await expect(page.locator(".header .t1")).toHaveText("Custom puzzle");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe('{"legacy":{}}');
  await expect(page.getByRole("button", { name: /Unfinished/ })).toContainText("1");
});
