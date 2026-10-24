import { test, expect } from "@playwright/test";

test("Journal fits all calendar content and the difficulty heading at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  // October 24 is a Saturday after the latest puzzle in this data set.
  await page.clock.install({ time: new Date("2026-10-24T12:00:00") });
  await page.goto("./");
  const grid = page.locator(".mgrid");
  await expect(grid.locator(".day")).toHaveCount(31);
  await expect(grid.locator(".day").filter({ hasText: /^24/ })).toContainText("Not yet");
  await page.evaluate(() => document.fonts.ready);

  const overflow = await grid.evaluate((grid) => {
    const bounds = grid.getBoundingClientRect();
    return [...grid.querySelectorAll(".day")].flatMap((cell) => {
      const box = cell.getBoundingClientRect();
      const outside = (inner, outer) =>
        inner.left < outer.left ||
        inner.right > outer.right ||
        inner.top < outer.top ||
        inner.bottom > outer.bottom;
      const childrenOverflow = [...cell.children].some((child) =>
        outside(child.getBoundingClientRect(), box)
      );
      return outside(box, bounds) || cell.scrollWidth > cell.clientWidth || childrenOverflow
        ? [cell.textContent.trim()]
        : [];
    });
  });
  expect.soft(overflow, "calendar cells and their content stay inside the grid").toEqual([]);

  const labelLines = await grid.locator(".x").evaluateAll((labels) =>
    labels.map((label) => {
      const text = document.createRange();
      text.selectNodeContents(label);
      return text.getClientRects().length;
    })
  );
  expect.soft(labelLines, "status labels stay on one line").toEqual([1]);

  const heading = page.locator(".srow.h > span").first();
  await expect(heading).toHaveText("Oct by difficulty");
  expect(
    await heading.evaluate((heading) => {
      const text = document.createRange();
      text.selectNodeContents(heading);
      return text.getClientRects().length;
    }),
    "difficulty heading stays on one line"
  ).toBe(1);
});
