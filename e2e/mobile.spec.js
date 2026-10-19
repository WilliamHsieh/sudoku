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
} from "./helpers.js";
import { touchDriver } from "./touch.js";
import { firstUnsolvedLatest } from "../src/game/daily.js";
import { puzzleData } from "../src/puzzles.js";

const SELECTED_BG = "rgb(211, 224, 248)";
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);
const EPS = 0.5;

function near(a, b, label) {
  expect(Math.abs(a - b), `${label}: ${a} ≉ ${b}`).toBeLessThanOrEqual(EPS);
}

function nearRect(got, want, label) {
  near(got.x, want.x, `${label} x`);
  near(got.y, want.y, `${label} y`);
  if (want.w != null) near(got.w, want.w, `${label} w`);
  if (want.h != null) near(got.h, want.h, `${label} h`);
}

async function rectOf(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right };
  });
}

test.describe("H2 header", () => {
  test("Play header faces, hits, title, board y and no divider", async ({ page }) => {
    await openBoard(page);
    const hd = page.locator(".hd");
    await expect(hd).toBeVisible();
    const header = await rectOf(hd);
    nearRect(header, { x: 0, y: 5, w: 390, h: 44 }, "header");

    const brand = page.locator(".hd-brand");
    const title = await brand.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        fs: cs.fontSize,
        fw: cs.fontWeight,
        x: r.x,
        y: r.y,
        border: cs.borderBottomWidth,
      };
    });
    expect(title.fs).toBe("22px");
    expect(title.fw).toBe("700");
    near(title.x, 16, "title x");
    near(title.y, 16, "title y");

    const hdBorder = await hd.evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(hdBorder).toBe("0px");
    expect(title.border).toBe("0px");

    const cal = page.getByRole("button", { name: "Journal" });
    const pause = page.getByRole("button", { name: "Pause" });
    const calHit = await rectOf(cal);
    const pauseHit = await rectOf(pause);
    nearRect(calHit, { x: 222.41, y: 5, w: 44, h: 44 }, "calendar hit");
    nearRect(pauseHit, { x: 337, y: 5, w: 44, h: 44 }, "pause hit");

    const calFace = await rectOf(cal.locator(".face"));
    const pauseFace = await rectOf(pause.locator(".face"));
    const timer = await rectOf(page.locator(".timer2"));
    nearRect(calFace, { x: 229.41, y: 12, w: 30, h: 30 }, "calendar face");
    nearRect(timer, { x: 269.41, y: 12, h: 30 }, "timer pill");
    nearRect(pauseFace, { x: 344, y: 12, w: 30, h: 30 }, "pause face");
    near(pauseFace.x + pauseFace.w, 374, "pause face right");

    const timerCss = await page.locator(".timer2").evaluate((el) => {
      const icon = el.querySelector(".ic");
      const time = el.querySelector("b, .time");
      return {
        icon: icon ? icon.getBoundingClientRect().width : 0,
        fs: time ? getComputedStyle(time).fontSize : "",
        fw: time ? getComputedStyle(time).fontWeight : "",
      };
    });
    near(timerCss.icon, 15, "timer icon");
    expect(timerCss.fs).toBe("14.4px");
    expect(timerCss.fw).toBe("600");

    const board = await page.locator(".board").boundingBox();
    near(board.y, 54, "board y");

    for (const hit of [calHit, pauseHit]) {
      expect(hit.w).toBeGreaterThanOrEqual(44);
      expect(hit.h).toBeGreaterThanOrEqual(44);
    }

    const t = await touchDriver(page);
    const before = await page.locator(".timer2 b, .timer .time").innerText();
    await t.tap(pause);
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expect(page.locator(".timer2 b, .timer .time")).toHaveText(before);
  });

  test("Journal header: Sudoku + Play pill", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".calendar-container")).toBeVisible();
    const hd = page.locator(".hd");
    await expect(hd).toBeVisible();
    const header = await rectOf(hd);
    nearRect(header, { x: 0, y: 5, w: 390, h: 44 }, "journal header");

    const brand = await rectOf(page.locator(".hd-brand"));
    near(brand.x, 16, "journal title x");
    near(brand.y, 16, "journal title y");
    const title = await page.locator(".hd-brand").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fs: cs.fontSize, fw: cs.fontWeight };
    });
    expect(title.fs).toBe("22px");
    expect(title.fw).toBe("700");

    const play = page.getByRole("button", { name: "Back to puzzle" });
    const playHit = await rectOf(play);
    const playFace = await rectOf(play.locator(".face"));
    nearRect(playFace, { x: 304.25, y: 12, w: 69.75, h: 30 }, "play face");
    near(playHit.y, 5, "play hit y");
    near(playHit.h, 44, "play hit h");
    expect(playHit.w).toBeGreaterThanOrEqual(44);
    expect(playHit.h).toBeGreaterThanOrEqual(44);
    await expect(play).toContainText("Play");
    await expect(page.locator(".hd")).toHaveCSS("border-bottom-width", "0px");
  });

  test("Calendar to Play round trip keeps progress and timer", async ({ page }) => {
    await openBoard(page);
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.tap(key(page, 4));
    await expectValue(page, 0, 4);
    const time = await page.locator(".timer2 b, .timer .time").innerText();

    await t.tap(page.getByRole("button", { name: "Journal" }));
    await expect(page.locator(".calendar-container")).toBeVisible();
    await expect(page.locator(".board")).toHaveCount(0);

    await t.tap(page.getByRole("button", { name: "Back to puzzle" }));
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expectValue(page, 0, 4);
    await expect(page.locator(".timer2 b, .timer .time")).toHaveText(time);
  });

  test("Play with no history opens the first unsolved of the latest day", async ({ page }) => {
    const pick = firstUnsolvedLatest(puzzleData, {});
    expect(pick, "a latest unsolved puzzle exists").toBeTruthy();
    await page.goto("./");
    await expect(page.locator(".calendar-container")).toBeVisible();
    await page.getByRole("button", { name: "Back to puzzle" }).click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    // Not the in-memory demo (cell 1 = 5). Same pick the app uses for today.
    await expectValue(page, 1, Number(pick.puzzle[1]));
    await expectValue(page, 0, Number(pick.puzzle[0]));
    await expect(page.locator(".board > .cell").nth(1)).not.toHaveAttribute("data-value", "5");
  });

  test("tapping a journal day opens that puzzle directly", async ({ page }) => {
    await page.goto("./");
    const day = page
      .locator(".calendar-day")
      .filter({ has: page.locator(".day-number", { hasText: /^18$/ }) });
    await day.click();
    await expect(page.locator(".modal")).toHaveCount(0);
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expectValue(page, 1, 7);
  });
});

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
      "manipulation"
    );
    const timer = await page.locator(".timer").boundingBox();
    expect(timer.height).toBe(30);
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
    const chipSizes = await page.evaluate(() => {
      const chip = document.querySelector(".pencil-box.matching-number");
      const host = chip.closest(".cell");
      return {
        chip: chip.getBoundingClientRect().width,
        cell: host.getBoundingClientRect().width,
      };
    });
    expect(chipSizes.chip).toBeCloseTo(chipSizes.cell * 0.34, 1);

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

  test("a conflict on a same-digit given uses the pink conflict fill", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.tap(key(page, 5));
    await expect(cell(page, 1)).toHaveClass(/given/);
    await expect(cell(page, 1)).toHaveClass(/same/);
    await expect(cell(page, 1)).toHaveClass(/conflict/);
    await expect(cell(page, 1)).toHaveCSS("background-color", CONFLICT_BG);
  });

  test("every conflicting cell draws Combo C's 5×5 inset conflict dot", async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.tap(key(page, 5));
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

  test("illegal swipe is refused: Not allowed, blockers tint, nothing written", async ({
    page,
  }) => {
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
});
