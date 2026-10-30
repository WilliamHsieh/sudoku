import { test, expect } from "@playwright/test";
import { openBoard, measureBoard, expectUnclippedEqualCells } from "./helpers.js";

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { width: r.width, height: r.height, x: r.x, bottom: r.bottom };
    };
    return {
      board: rect(".board"),
      pad: rect(".keypad"),
      key: rect(".key"),
      digit: rect(".key .digit"),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await openBoard(page);
});

test("the keypad scales its keys, digits and gaps to 90% below the full-size board", async ({
  page,
}) => {
  const g = await geometry(page);
  expect(g.board.width).toBeCloseTo(374, 1);
  expect(g.pad.width).toBeCloseTo(374 * 0.9, 1);
  expect(g.pad.height).toBeCloseTo(208 * 0.9, 1);
  expect(g.key.width).toBeCloseTo(((374 - 16) / 3) * 0.9, 1);
  expect(g.key.height).toBeCloseTo(64 * 0.9, 1);
  expect(g.digit.height).toBeCloseTo(30 * 0.9, 1);
  expect(g.pad.x).toBeCloseTo((390 - g.pad.width) / 2, 1);
  expect(g.pad.bottom).toBeLessThan(760);
  expect(g.overflow).toBe(false);
});

test("a shorter viewport shrinks the keypad before the board, then restores both", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(async () => (await geometry(page)).key.height).toBeLessThan(57.6 - 1);
  const short = await geometry(page);
  expect(short.board.width).toBeCloseTo(374, 1);
  expect(short.key.height).toBeGreaterThan(44.8);

  await page.setViewportSize({ width: 390, height: 640 });
  await expect.poll(async () => (await geometry(page)).key.height).toBeCloseTo(44.8, 1);
  const shorter = await geometry(page);
  expect(shorter.board.width).toBeLessThan(374);
  expect(shorter.pad.bottom).toBeLessThan(640);
  expect(shorter.overflow).toBe(false);
  expectUnclippedEqualCells(await measureBoard(page));

  await page.setViewportSize({ width: 390, height: 760 });
  await expect.poll(async () => (await geometry(page)).key.height).toBeCloseTo(57.6, 1);
  expect((await geometry(page)).board.width).toBeCloseTo(374, 1);
});

test("narrow widths fit and the desktop breakpoint keeps the existing board", async ({ page }) => {
  for (const width of [320, 280, 599]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(async () => (await geometry(page)).pad.width).toBeLessThan(width);
    const g = await geometry(page);
    expect(g.board.width).toBeLessThanOrEqual(width - 16);
    expect(g.key.height).toBeGreaterThanOrEqual(44.8 - 0.1);
    expect(g.pad.bottom).toBeLessThan(844);
    expect(g.overflow).toBe(false);
    expectUnclippedEqualCells(await measureBoard(page));
  }
  await page.setViewportSize({ width: 600, height: 844 });
  await expect(page.locator(".keypad")).toBeHidden();
  expect((await geometry(page)).board.width).toBeCloseTo(568, 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  expect((await geometry(page)).board.width).toBe(650);
  await page.setViewportSize({ width: 390, height: 760 });
  await expect(page.locator(".keypad")).toBeVisible();
  await expect.poll(async () => (await geometry(page)).key.height).toBeCloseTo(57.6, 1);
});

test("changes in safe-area padding and tool height give space to the board first", async ({
  page,
}) => {
  await page.locator("main").evaluate((el) => {
    el.style.paddingBottom = "50px";
  });
  await expect.poll(async () => (await geometry(page)).key.height).toBeLessThan(57);
  expect((await geometry(page)).board.width).toBeCloseTo(374, 1);
  await page.locator(".tools").evaluate((el) => {
    el.style.paddingTop = "10px";
  });
  await expect.poll(async () => (await geometry(page)).key.height).toBeLessThan(54);
  expect((await geometry(page)).board.width).toBeCloseTo(374, 1);
});

test("flying digits keep the rendered key size when the keypad shrinks", async ({ page }) => {
  for (const height of [760, 640]) {
    await page.setViewportSize({ width: 390, height });
    await page.locator('.cell[data-i="0"]').click();
    const key = page.locator('.key[data-d="4"]');
    const box = await key.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 4 });
    const lift = page.locator(".lift");
    await expect(lift).toBeVisible();
    const font = await lift.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeCloseTo((box.height / 64) * 30, 1);
    await page.mouse.up();
    await expect(lift).toHaveCount(0);
  }
});
