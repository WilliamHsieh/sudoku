import { freezeTimers } from "./paint-cases.js";
import { headerCases } from "./header-cases.js";
import { switchNotesMode } from "./helpers.js";
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
  CONFLICT_BG,
  CONFLICT,
  expectNoGridShift,
  measureChipLineGaps,
  expectGapsAtLeast,
  readChipGeometry,
  expectChipGeometry,
  expectCornerChipAndAimGaps,
} from "./helpers.js";
import { touchDriver } from "./touch.js";

const SELECTED_BG = "rgb(211, 224, 248)";
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);
// 0.5px absorbs subpixel rounding; header fit is strict: gap >= 8, scrollWidth <= clientWidth.
const EPS = 0.5;

function near(a, b, label) {
  expect(Math.abs(a - b), `${label}: ${a} ≉ ${b}`).toBeLessThanOrEqual(EPS);
}

async function clockTouch(page) {
  await freezeTimers(page);
  return touchDriver(page, { clock: true });
}

test.describe("Left + C phone header", () => headerCases(true));

test.describe("pad", () => {
  test.beforeEach(async ({ page }) => {
    await openBoard(page);
  });

  test("the pad and tools fit a 390px iPhone screen", async ({ page }) => {
    const board = await page.locator(".board").boundingBox();
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(390);
    expect(board.width).toBeCloseTo(374, 1);
    expect(board.height).toBeCloseTo(374, 1);
    await expect(page.locator(".keypad")).toBeVisible();
    await expect(page.locator(".key")).toHaveCount(9);
    await expect(page.locator(".tools")).toBeVisible();
    const keyBox = await page.locator(".key").first().boundingBox();
    expect(keyBox.width).toBeCloseTo(119.33, 1);
    expect(keyBox.height).toBe(64);
    const pad = await page.locator(".keypad").boundingBox();
    expect(pad.y + pad.height).toBeLessThanOrEqual(844);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
    expect(await page.locator(".board").evaluate((el) => getComputedStyle(el).touchAction)).toBe(
      "none"
    );
    const timer = await page.locator(".tp .face").boundingBox();
    expect(timer.height).toBe(36);
  });

  test("highlight chips, conflict and notes do not resize the board or cells", async ({ page }) => {
    const t = await touchDriver(page);
    const before = await measureBoard(page);
    expectUnclippedEqualCells(before);

    await t.tap(cell(page, 1)); // given 5: same-digit chips
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 5)); // conflict, notes still in peers
    await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
    await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();
    const geo = await readChipGeometry(page);
    expectChipGeometry(geo, 1);
    expect(geo.chip).toBeGreaterThanOrEqual(11.5);

    const after = await measureBoard(page);
    expectUnclippedEqualCells(after);
    expectSameGeometry(before, after);
  });

  test("chips and aim stay ≥1px from every grid line at 390", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 1));
    const chips = await measureChipLineGaps(page, ".pencil-box.matching-number");
    expectGapsAtLeast(chips, 1);
    const geo = await readChipGeometry(page);
    expectChipGeometry(geo, 1);
    expect(geo.chip).toBeGreaterThanOrEqual(11.5);
    await expectCornerChipAndAimGaps(page);
  });

  test("Shift, chips and aim never move the 81 cell rects at 390", async ({ page }) => {
    const max = await expectNoGridShift(page);
    expect(max).toBe(0);
  });

  test("pad digits are Atkinson 400; board givens and answers use the system font", async ({
    page,
  }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 4));
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

  test("double-tap writes the answer and does not clear it", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
    await t.doubleTap(key(page, 4));
    await expectValue(page, 0, 4);
    await t.doubleTap(key(page, 7));
    await expectValue(page, 0, 7);
    await t.doubleTap(key(page, 7));
    await expectValue(page, 0, 7);
  });

  test("a conflict on a same-digit given uses the pink conflict fill", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 5));
    await expect(cell(page, 1)).toHaveClass(/given/);
    await expect(cell(page, 1)).toHaveClass(/same/);
    await expect(cell(page, 1)).toHaveClass(/conflict/);
    await expect(cell(page, 1)).toHaveCSS("background-color", CONFLICT_BG);
  });

  test("every conflicting cell draws Combo C's 5×5 inset conflict dot", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 5));
    await expect(cell(page, 0)).toHaveClass(/conflict/);
    await expect(cell(page, 1)).toHaveClass(/given/);
    await expect(cell(page, 1)).toHaveClass(/conflict/);

    for (const i of [0, 1]) {
      const dot = await cell(page, i).evaluate((el) => {
        const after = getComputedStyle(el, "::after");
        const box = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const padTop = box.top + parseFloat(cs.borderTopWidth);
        const padRight = box.right - parseFloat(cs.borderRightWidth);
        const top = parseFloat(after.top);
        const right = parseFloat(after.right);
        const w = parseFloat(after.width);
        const h = parseFloat(after.height);
        const inner = el.querySelector(".pen-box .conflict");
        return {
          content: after.content,
          position: after.position,
          top,
          right,
          w,
          h,
          radius: after.borderRadius,
          color: after.backgroundColor,
          x: padRight - right - w,
          y: padTop + top,
          innerDisplay: inner ? getComputedStyle(inner).display : "none",
        };
      });
      expect(dot.content, `cell ${i} ::after content`).toBe('""');
      expect(dot.position, `cell ${i} ::after position`).toBe("absolute");
      expect(dot.w, `cell ${i} ::after width`).toBe(5);
      expect(dot.h, `cell ${i} ::after height`).toBe(5);
      expect(dot.top, `cell ${i} ::after top`).toBe(3);
      expect(dot.right, `cell ${i} ::after right`).toBe(3);
      expect(dot.radius, `cell ${i} ::after radius`).toBe("50%");
      expect(dot.color, `cell ${i} ::after colour`).toBe(CONFLICT);
      expect(dot.innerDisplay, `cell ${i} pen-box marker`).toBe("none");
      const box = await cell(page, i).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          padTop: r.top + parseFloat(cs.borderTopWidth),
          padRight: r.right - parseFloat(cs.borderRightWidth),
        };
      });
      near(dot.x, box.padRight - 3 - 5, `cell ${i} dot x`);
      near(dot.y, box.padTop + 3, `cell ${i} dot y`);
    }
  });

  test("double-tap does not overwrite a given", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 1));
    await t.doubleTap(key(page, 9));
    await expectValue(page, 1, 5);
    await expect(page.locator(".toast")).toHaveText("Given digits can't change");
  });

  test("Notes menu Auto/Manual; Manual starts empty and Auto restores computed notes", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Notes mode: Auto" }).filter({ visible: true })
    ).toHaveAttribute("aria-expanded", "false");
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
    await switchNotesMode(page);
    await expect(
      page.getByRole("button", { name: "Notes mode: Manual" }).filter({ visible: true })
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#notes-mode")).toContainText("Manual");
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
    await switchNotesMode(page);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  });

  test("swipe up past the arm threshold toggles a candidate", async ({ page }) => {
    const t = await clockTouch(page);
    await t.tap(cell(page, 0));
    await t.swipeUp(key(page, 2), 60);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
    await expectValue(page, 0, 0);
    await page.clock.runFor(400);
    await t.swipeUp(key(page, 2), 60);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
    await page.clock.runFor(400);
    await expect(page.locator(".lift")).toHaveCount(0);
  });

  test("drag shows the label, preview and arms at ~28px with hysteresis", async ({ page }) => {
    const t = await touchDriver(page);
    await switchNotesMode(page); // Manual: cell 0 has no notes, so 3 is an add
    await t.tap(cell(page, 0));
    const k = key(page, 3);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 12);
    await expect(k).toHaveClass(/pressed/);
    await expect(k).toHaveClass(/show-label/);
    await expect(k.locator(".label:not(.bottom)")).toHaveText("+ candidate");
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

  test("illegal swipe is refused: Not allowed, blockers tint, nothing written", async ({
    page,
  }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    const k = key(page, 5);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 40);
    await expect(k.locator(".label:not(.bottom)")).toHaveText("Not allowed");
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
    await t.doubleTap(key(page, 4));
    await expectValue(page, 0, 4);
    // The swipe left 2 highlighted, so this double-tap switches to 4 and drops
    // the selection. The 4 is in the cell. Erase still needs it selected.
    await t.tap(cell(page, 0));
    await t.tap(page.locator("#erase"));
    await expectValue(page, 0, 0);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
    await t.tap(page.locator("#erase"));
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  });

  test("undo/redo: the ring travels, then the change applies", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 4));
    await expectValue(page, 0, 4);
    await t.tap(page.locator("#undo"));
    await expectValue(page, 0, 0);
    await t.tap(page.locator("#redo"));
    await expectValue(page, 0, 4);
  });

  test("double-tap fills a single-candidate cell in Auto; a multi-candidate cell only selects", async ({
    page,
  }) => {
    const t = await clockTouch(page);
    await t.tap(cell(page, 0));
    for (const d of [3, 4, 6, 7]) {
      await t.swipeUp(key(page, d), 60);
      await page.clock.runFor(80);
    }
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "2");
    // The last swipe left 7 focused. The lone candidate still fills, and the
    // highlight follows the 2 that landed.

    await t.tap(cell(page, 0), { holdMs: 40 });
    await page.clock.runFor(120);
    await t.tap(cell(page, 0), { holdMs: 40 });
    await expectValue(page, 0, 2);
    await expect(cell(page, 0)).toHaveClass(/selected/);
    await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "2");
    await expect(page.locator('.key[data-d="2"]')).toHaveClass(/shown/);
    await expect(cell(page, 21)).toHaveClass(/same/);

    await t.tap(page.locator("#undo"));
    await expectValue(page, 0, 0);
    // The fill left 2 highlighted. Let the 300ms hide window finish.
    await t.tap(key(page, 2));
    await page.clock.runFor(301);
    await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");

    await t.tap(cell(page, 2), { holdMs: 40 });
    await page.clock.runFor(120);
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
});
