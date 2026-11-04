import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

test.use({ video: { mode: "on", size: { width: 1280, height: 844 } } });

test("record real hint highlighting, coordinates and story navigation at 1280", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 844 });
  await openBoard(page);
  const given = page.locator(".board > .cell.given").first();
  await given.click();
  await expect(given).toHaveClass(/selected/);
  const before = await page
    .locator(".board > .cell")
    .evaluateAll((cells) =>
      cells.map((cell) => [cell.getAttribute("data-value"), cell.getAttribute("data-notes")])
    );
  await page.waitForTimeout(1600);
  const [worker] = await Promise.all([
    page.waitForEvent("worker"),
    page.locator("#hint-trigger").click(),
  ]);
  expect(worker.url()).toMatch(/engine\.worker/);
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await expect(
    page.locator(".board > .cell.selected, .board > .cell.same, .board .matching-number")
  ).toHaveCount(0);
  await page.waitForTimeout(3000);
  async function flashReference() {
    const ref = panel.locator(".hint-body .hint-reference").first();
    await ref.scrollIntoViewIfNeeded();
    await ref.click();
    await expect(page.locator(".board > .cell.hint-focus")).toHaveCount(1);
    await page.waitForTimeout(1200);
  }
  async function tapSide(side) {
    const rect = await panel.locator(".hint-body").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: el.clientWidth,
        height: el.clientHeight,
      };
    });
    const x = side === "left" ? rect.x + 4 : rect.x + rect.width - 4;
    await page.mouse.click(x, rect.y + 24);
  }
  await flashReference();
  await tapSide("right");
  await expect(panel.locator(".hint-position")).toHaveText("2/3");
  await page.waitForTimeout(2500);
  for (const paragraph of await panel.locator(".hint-body > p").all()) {
    await paragraph.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
  }
  await flashReference();
  await tapSide("left");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await page.waitForTimeout(1700);
  await tapSide("right");
  await tapSide("right");
  await expect(panel.locator(".hint-position")).toHaveText("3/3");
  for (const paragraph of await panel.locator(".hint-body > p").all()) {
    await paragraph.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
  }
  await flashReference();
  await tapSide("right");
  await expect(panel.locator(".hint-position")).toHaveText("3/3");
  expect(
    await page
      .locator(".board > .cell")
      .evaluateAll((cells) =>
        cells.map((cell) => [cell.getAttribute("data-value"), cell.getAttribute("data-notes")])
      )
  ).toEqual(before);
  await page.waitForTimeout(1400);
  await panel.locator('[data-action="apply"]').click();
  await expect(panel).toContainText("這一步已完成");
  await page.waitForTimeout(2000);
  await panel.locator('[data-action="undo"]').click();
  await expect(panel).toHaveCount(0);
  expect(
    await page
      .locator(".board > .cell")
      .evaluateAll((cells) =>
        cells.map((cell) => [cell.getAttribute("data-value"), cell.getAttribute("data-notes")])
      )
  ).toEqual(before);
  await page.waitForTimeout(1600);
});
