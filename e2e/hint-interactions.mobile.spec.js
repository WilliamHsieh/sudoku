import { test, expect } from "@playwright/test";
import { cell, openBoard } from "./helpers.js";
import { touchDriver } from "./touch.js";
import { openPhaseThreeCase, phaseThreeCases } from "./phase-three-cases.js";

async function notes(page) {
  return page
    .locator(".board > .cell")
    .evaluateAll((cells) =>
      cells.map((c) => [c.getAttribute("data-value"), c.getAttribute("data-notes")])
    );
}
async function tapSide(page, t, side) {
  const rect = await page.locator("#hint-panel .hint-body").boundingBox();
  const x = side === "left" ? rect.x + 4 : rect.x + rect.width - 4;
  await t.start(x, rect.y + 24);
  await t.end(x, rect.y + 24);
}

test("touch story taps and inline coordinates work without confusing a long proof scroll", async ({
  page,
}) => {
  const example = phaseThreeCases.find((c) => c.id === "aligned-pair-exclusion" && c.width === 390);
  await openPhaseThreeCase(page, example);
  const t = await touchDriver(page);
  const before = await notes(page);
  await t.tap(page.locator("#hint-trigger"));
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  const ref = panel.locator(".hint-reference").first();
  await t.tap(ref);
  await expect(page.locator(".board .hint-focus")).toHaveCount(1);
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await tapSide(page, t, "right");
  await expect(panel.locator(".hint-position")).toHaveText("2/3");
  await expect(page.locator(".board .hint-focus")).toHaveCount(0);
  const body = panel.locator(".hint-body");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const rect = await body.boundingBox();
  const x = rect.x + rect.width / 2;
  await t.start(x, rect.y + rect.height - 30);
  for (let n = 1; n <= 6; n++) {
    await t.move(x, rect.y + rect.height - 30 - ((rect.height - 60) * n) / 6);
    await page.waitForTimeout(20);
  }
  await t.end(x, rect.y + 30);
  await expect(panel.locator(".hint-position")).toHaveText("2/3");
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await body.locator("p").last().scrollIntoViewIfNeeded();
  await expect(body.locator("p").last()).toBeInViewport();
  await expect(panel.locator('[data-action="next"]')).toBeInViewport();
  await tapSide(page, t, "left");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  expect(await notes(page)).toEqual(before);
});

test("opening a hint cancels a keypad hold and prevents a later release from editing", async ({
  page,
}) => {
  await openBoard(page);
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  const before = await notes(page);
  const key = page.locator('.key[data-d="1"]');
  const p = await t.center(key);
  await t.start(p.x, p.y);
  await page.waitForTimeout(300);
  // A second independent activation interrupts the held input. Window pointer
  // listeners must not commit that old gesture when its first contact ends.
  await page.locator("#hint-trigger").click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  await t.end(p.x, p.y);
  await page.waitForTimeout(450);
  await expect(page.locator("body > .lift")).toHaveCount(0);
  expect(await notes(page)).toEqual(before);
  await page.locator('#hint-panel [data-action="close"]').click();
  await expect(key).not.toHaveClass(/holding|lifted|pressed/);
});
