import { test, expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";

test("Journal fits all calendar content and the difficulty heading at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  // Keep a Saturday marked "Not yet" as the daily puzzle data grows.
  const latest = Object.keys(puzzleData).sort().at(-1);
  const latestDay = new Date(`${latest}T12:00:00`);
  const saturday = new Date(latestDay);
  do {
    saturday.setDate(saturday.getDate() + 1);
  } while (saturday.getDay() !== 6);
  await page.clock.install({ time: saturday });
  await page.goto("./");
  if (saturday.getMonth() !== latestDay.getMonth()) {
    await page.locator(".mhead").getByRole("button", { name: "Next month" }).click();
    await expect(page.locator(".track")).toHaveCount(0);
  }
  const grid = page.locator(".mgrid");
  const days = new Date(saturday.getFullYear(), saturday.getMonth() + 1, 0).getDate();
  await expect(grid.locator(".day")).toHaveCount(days);
  await expect(
    grid.locator(".day.future").filter({ hasText: new RegExp(`^${saturday.getDate()}\\b`) })
  ).toContainText("Not yet");
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
  expect
    .soft(
      labelLines.every((lines) => lines === 1),
      "status labels stay on one line"
    )
    .toBe(true);

  const heading = page.locator(".srow.h > span").first();
  await expect(heading).toContainText("by difficulty");
  expect(
    await heading.evaluate((heading) => {
      const text = document.createRange();
      text.selectNodeContents(heading);
      return text.getClientRects().length;
    }),
    "difficulty heading stays on one line"
  ).toBe(1);
});
