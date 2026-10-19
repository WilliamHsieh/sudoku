// Mobile input: iPhone viewport + real CDP touch. Demo puzzle cell 0 is empty
// with Auto candidates 2 3 4 6 7; cell 1 is a given 5.
import { test, expect } from "@playwright/test";
import {
  cell,
  pencil,
  openBoard,
  expectValue,
  measureBoard,
  expectUnclippedEqualCells,
  expectSameGeometry,
  readDigitFonts,
} from "./helpers.js";
import { touchDriver } from "./touch.js";

const SELECTED_BG = "rgb(211, 224, 248)";
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("the pad and tools fit a 390px iPhone screen", async ({ page }) => {
  const board = await page.locator(".board").boundingBox();
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual(390);
  await expect(page.locator(".keypad")).toBeVisible();
  await expect(page.locator(".key")).toHaveCount(9);
  await expect(page.locator(".tools")).toBeVisible();
  const pad = await page.locator(".keypad").boundingBox();
  expect(pad.y + pad.height).toBeLessThanOrEqual(844);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(390);
  expect(await page.locator(".board").evaluate((el) => getComputedStyle(el).touchAction)).toBe(
    "manipulation"
  );
});

test("highlight chips, conflict and notes do not resize the board or cells", async ({ page }) => {
  const t = await touchDriver(page);
  const before = await measureBoard(page);
  expectUnclippedEqualCells(before);

  await t.tap(cell(page, 1)); // given 5: same-digit chips
  await t.tap(cell(page, 0));
  await t.tap(key(page, 5)); // conflict, notes still in peers
  await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
  await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();

  const after = await measureBoard(page);
  expectUnclippedEqualCells(after);
  expectSameGeometry(before, after);
});

test("pad digits are Atkinson 400; board givens and answers use the system font", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.tap(key(page, 4));
  const fonts = await readDigitFonts(page);
  expect(fonts.pad.family).toMatch(/Atkinson Hyperlegible/);
  expect(fonts.pad.weight).toBe("400");
  expect(fonts.given.family).not.toMatch(/Atkinson/);
  expect(fonts.given.weight).toBe("700");
  expect(fonts.answer.family).not.toMatch(/Atkinson/);
  expect(fonts.answer.weight).toBe("400");
  expect(fonts.answer.family).toBe(fonts.given.family);
  expect(fonts.atkinsonBold).toBe(0);
});

test("tap on a key writes the answer; tapping the same key clears it", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
  await t.tap(key(page, 4));
  await expectValue(page, 0, 4);
  await t.tap(key(page, 7));
  await expectValue(page, 0, 7);
  await t.tap(key(page, 7));
  await expectValue(page, 0, 0);
});

test("tap does not overwrite a given", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 1));
  await t.tap(key(page, 9));
  await expectValue(page, 1, 5);
});

test("Notes switch Auto/Manual; Manual starts empty and Auto restores computed notes", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await expect(page.locator("#notes-mode")).toHaveAttribute("aria-checked", "true");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await t.tap(page.locator("#notes-mode"));
  await expect(page.locator("#notes-mode")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#notes-mode")).toContainText("Manual");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  await t.tap(page.locator("#notes-mode"));
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
});

test("swipe up past the arm threshold toggles a candidate", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.swipeUp(key(page, 2), 60);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
  await expectValue(page, 0, 0);
  await page.waitForTimeout(400);
  await t.swipeUp(key(page, 2), 60);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await page.waitForTimeout(400);
  await expect(page.locator(".lift")).toHaveCount(0);
});

test("drag shows the label, preview and arms at ~28px with hysteresis", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(page.locator("#notes-mode")); // Manual: cell 0 has no notes, so 3 is an add
  await t.tap(cell(page, 0));
  const k = key(page, 3);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y - 12);
  await expect(k).toHaveClass(/pressed/);
  await expect(k).toHaveClass(/show-label/);
  await expect(k.locator(".label")).toHaveText("+ candidate");
  await expect(pencil(page, 0, 3)).toHaveClass(/preview-add/);
  await expect(k).not.toHaveClass(/armed/);

  await t.move(p.x, p.y - 30);
  await expect(k).toHaveClass(/armed/);
  await t.move(p.x, p.y - 24);
  await expect(k).toHaveClass(/armed/);
  await t.move(p.x, p.y - 20);
  await expect(k).not.toHaveClass(/armed/);
  await t.end(p.x, p.y - 20);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
});

test("sub-threshold release and a long still press write nothing", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.swipeUp(key(page, 6), 18);
  await page.waitForTimeout(350);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await expectValue(page, 0, 0);

  await t.tap(key(page, 4), { holdMs: 650 });
  await expectValue(page, 0, 0);
});

test("illegal swipe is refused: Not allowed, blockers tint, nothing written", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  const k = key(page, 5);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y - 40);
  await expect(k.locator(".label")).toHaveText("Not allowed");
  await expect(k).toHaveClass(/illegal/);
  await expect(cell(page, 1)).toHaveClass(/blocking/);
  await t.end(p.x, p.y - 40);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await expect(cell(page, 1)).toHaveClass(/blocked/);
});

test("Erase clears the answer, then Auto overrides", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.swipeUp(key(page, 2), 60);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
  await t.tap(key(page, 4));
  await expectValue(page, 0, 4);
  await t.tap(page.locator("#erase"));
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
  await t.tap(page.locator("#erase"));
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
});

test("undo/redo: the ring travels, then the change applies", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.tap(key(page, 4));
  await expectValue(page, 0, 4);
  await t.tap(page.locator("#undo"));
  await expectValue(page, 0, 0);
  await t.tap(page.locator("#redo"));
  await expectValue(page, 0, 4);
});

test("double-tap fills a single-candidate cell in Auto; a multi-candidate cell only selects", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  for (const d of [3, 4, 6, 7]) {
    await t.swipeUp(key(page, d), 60);
    await page.waitForTimeout(80);
  }
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "2");

  await t.tap(cell(page, 0), { holdMs: 40 });
  await page.waitForTimeout(120);
  await t.tap(cell(page, 0), { holdMs: 40 });
  await expectValue(page, 0, 2);

  await t.tap(page.locator("#undo"));
  await expectValue(page, 0, 0);

  await t.tap(cell(page, 2), { holdMs: 40 });
  await page.waitForTimeout(120);
  await t.tap(cell(page, 2), { holdMs: 40 });
  await expectValue(page, 2, 0);
  await expect(cell(page, 2)).toHaveClass(/selected/);
});

test("taps further apart than ~300ms do not fill", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  for (const d of [3, 4, 6, 7]) {
    await t.swipeUp(key(page, d), 60);
    await page.waitForTimeout(80);
  }
  await t.tap(cell(page, 0), { holdMs: 40 });
  await page.waitForTimeout(450);
  await t.tap(cell(page, 0), { holdMs: 40 });
  await expectValue(page, 0, 0);
});
