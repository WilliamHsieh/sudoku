import { test, expect } from "@playwright/test";
import { seed, solved } from "./bank-fixture.js";
for (const width of [320, 390, 1280])
  for (const time of [402, 359999]) {
    test(`unfinished times remain contained at ${width}, ${time}s`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await seed(page, { time });
      await page.getByRole("button", { name: /Unfinished/ }).click();
      const row = page.locator(".uf");
      await expect(row).toBeVisible();
      const r = await row.boundingBox();
      expect(r.x + r.width).toBeLessThanOrEqual(width);
      expect(await row.locator(".uf-time").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true
      );
    });
  }
for (const width of [390, 1280])
  test(`equal result cells do not overlap dividers at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await solved(page, { count: 1 });
    const widths = await page
      .locator(".sv-panel dl > div")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(Math.abs(widths[0] - widths[1])).toBeLessThan(1);
  });
