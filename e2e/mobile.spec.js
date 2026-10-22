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

    const views = page.getByRole("navigation", { name: "Views" });
    const playSeg = page.getByRole("button", { name: "Play", exact: true });
    const journalSeg = page.getByRole("button", { name: "Journal", exact: true });
    const pause = page.getByRole("button", { name: "Pause" });
    await expect(playSeg).toHaveAttribute("aria-current", "page");
    await expect(journalSeg).not.toHaveAttribute("aria-current");
    await expect(page.locator(".hbtn.cal, .hpill")).toHaveCount(0);

    const track = await rectOf(views);
    const pauseHit = await rectOf(pause);
    const pauseFace = await rectOf(pause.locator(".face"));
    const timer = await rectOf(page.locator(".timer2"));
    near(track.y, 11, "seg y");
    near(track.h, 32, "seg h");
    near(track.x + track.w, 374, "seg right");
    near(track.x - (pauseHit.x + pauseHit.w), 4, "pause to seg");
    expect(pauseHit.w).toBeGreaterThanOrEqual(44);
    expect(pauseHit.h).toBeGreaterThanOrEqual(44);
    expect(pauseHit.x).toBeLessThan(track.x);
    expect(timer.x).toBeLessThan(pauseHit.x);
    near(pauseFace.w, 30, "pause face w");
    near(pauseFace.h, 30, "pause face h");
    expect(timer.x + timer.w).toBeLessThanOrEqual(pauseHit.x + EPS);

    const hits = await views.evaluate((nav) =>
      [...nav.querySelectorAll("button")].map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const top = parseFloat(after.top);
        const bottom = parseFloat(after.bottom);
        return {
          h: r.height - top - bottom,
          gapL: parseFloat(after.left),
          gapR: parseFloat(after.right),
        };
      })
    );
    expect(hits).toHaveLength(2);
    for (const hit of hits) {
      expect(hit.h).toBeGreaterThanOrEqual(44);
      expect(hit.gapL).toBe(0);
      expect(hit.gapR).toBe(0);
    }
    const playBox = await rectOf(playSeg);
    const journalBox = await rectOf(journalSeg);
    const order = await views.evaluate((nav) =>
      [...nav.querySelectorAll("button")].map((el) => el.getAttribute("aria-label"))
    );
    expect(order).toEqual(["Journal", "Play"]);
    expect(journalBox.x).toBeLessThan(playBox.x);
    near(journalBox.x + journalBox.w, playBox.x, "segment seam");

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

    const t = await touchDriver(page);
    const before = await page.locator(".timer2 b, .timer .time").innerText();
    await t.tap(pause);
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expect(page.locator(".timer2 b, .timer .time")).toHaveText(before);
  });

  test("Journal header: same segment track, Journal selected", async ({ page }) => {
    await openBoard(page);
    const playTrack = await rectOf(page.getByRole("navigation", { name: "Views" }));
    await page.goto("./");
    await expect(page.locator(".journal")).toBeVisible();
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

    const play = page.getByRole("button", { name: "Play", exact: true });
    const journal = page.getByRole("button", { name: "Journal", exact: true });
    await expect(journal).toHaveAttribute("aria-current", "page");
    await expect(play).not.toHaveAttribute("aria-current");
    await expect(page.locator(".timer2")).toHaveCount(0);
    await expect(page.locator("#pause")).toHaveCount(0);
    const track = await rectOf(page.getByRole("navigation", { name: "Views" }));
    nearRect(track, playTrack, "seg box matches Play");
    near(track.x + track.w, 374, "seg right");
    await expect(page.locator(".hd")).toHaveCSS("border-bottom-width", "0px");
  });

  test("a long timer grows to the left and the segment track stays put", async ({ page }) => {
    await openBoard(page);
    const before = await rectOf(page.getByRole("navigation", { name: "Views" }));
    await page.locator("#pause").click();
    await page.locator(".timer2 b").evaluate((el) => {
      el.textContent = "1:02:03";
    });
    const after = await rectOf(page.getByRole("navigation", { name: "Views" }));
    nearRect(after, before, "seg stays");
    const brand = await rectOf(page.locator(".hd-brand"));
    const timer = await rectOf(page.locator(".timer2"));
    const pause = await rectOf(page.locator("#pause"));
    expect(timer.x, "timer clears the brand").toBeGreaterThanOrEqual(brand.x + brand.w - EPS);
    expect(timer.x + timer.w).toBeLessThanOrEqual(pause.x + EPS);
    near(after.x - (pause.x + pause.w), 4, "pause gap");
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(390);
    const wrapped = await page.locator(".hd-r").evaluate((el) => getComputedStyle(el).flexWrap);
    expect(wrapped).toBe("nowrap");
  });

  test("Journal to Play round trip keeps progress and timer", async ({ page }) => {
    await openBoard(page);
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.doubleTap(key(page, 4));
    await expectValue(page, 0, 4);
    const time = await page.locator(".timer2 b, .timer .time").innerText();

    await t.tap(page.getByRole("button", { name: "Journal", exact: true }));
    await expect(page.locator(".journal")).toBeVisible();
    await expect(page.locator(".board")).toHaveCount(0);

    await t.tap(page.getByRole("button", { name: "Play", exact: true }));
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expectValue(page, 0, 4);
    await expect(page.locator(".timer2 b, .timer .time")).toHaveText(time);
  });

  test("Play with no history opens the first unsolved of the latest day", async ({ page }) => {
    const pick = firstUnsolvedLatest(puzzleData, {});
    expect(pick, "a latest unsolved puzzle exists").toBeTruthy();
    await page.goto("./");
    await expect(page.locator(".journal")).toBeVisible();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    // Not the in-memory demo (cell 1 = 5). Same pick the app uses for today.
    await expectValue(page, 1, Number(pick.puzzle[1]));
    await expectValue(page, 0, Number(pick.puzzle[0]));
    await expect(page.locator(".board > .cell").nth(1)).not.toHaveAttribute("data-value", "5");
  });

  test("tapping a journal day opens that day's sheet, not the board", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator(".journal")).toBeVisible();
    await expect(page.locator(".ulink")).toHaveCount(0);
    await page.locator(".mobile .day.is-latest").click();
    await expect(page.locator(".sheet.on")).toBeVisible();
    await expect(page.locator(".modal")).toHaveCount(0);
    await expect(page.locator(".board")).toHaveCount(0);
    await page
      .locator(".sheet .prow")
      .filter({ hasText: "Easy" })
      .getByRole("button", { name: "Start" })
      .click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
  });
});

test.describe("narrow header", () => {
  const widths = [320, 360, 375, 390];

  async function headerState(page) {
    return page.evaluate(() => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right };
      };
      const hd = document.querySelector(".hd");
      const brand = document.querySelector(".hd-brand");
      const nav = document.querySelector(".mseg");
      const timer = document.querySelector(".timer2");
      const time = document.querySelector(".timer2 b");
      const pause = document.querySelector("#pause");
      const buttons = [...document.querySelectorAll(".mseg button")];
      const brandCs = getComputedStyle(brand);
      const brandHidden = brandCs.position === "absolute";
      const labels = [...document.querySelectorAll(".mseg-label")];
      const icons = labels.length > 0 && getComputedStyle(labels[0]).display === "none";
      const trunc = (el) =>
        !el || getComputedStyle(el).display === "none"
          ? null
          : { sw: el.scrollWidth, cw: el.clientWidth };
      const hits = buttons.map((el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        return r.height - parseFloat(after.top) - parseFloat(after.bottom);
      });
      return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        padL: parseFloat(getComputedStyle(hd).paddingLeft),
        padR: parseFloat(getComputedStyle(hd).paddingRight),
        brandDisplay: brandCs.display,
        brandHidden,
        icons,
        brand: brandHidden ? null : box(brand),
        nav: box(nav),
        timer: box(timer),
        time: box(time),
        pause: box(pause),
        names: buttons.map((el) => el.getAttribute("aria-label")),
        buttons: buttons.map(box),
        hits,
        trunc: [
          brandHidden ? null : trunc(brand),
          trunc(time),
          ...labels.map(trunc),
          ...buttons.map(trunc),
        ],
      };
    });
  }

  function assertFit(state, width, view) {
    const where = `${view} @ ${width}`;
    expect(state.scrollW, `${where} scrolls horizontally`).toBeLessThanOrEqual(state.vw + 0.5);
    expect(state.padL, `${where} padding-left`).toBeGreaterThanOrEqual(8 - 0.5);
    expect(state.padR, `${where} padding-right`).toBeGreaterThanOrEqual(8 - 0.5);
    expect(state.brandDisplay, `${where} brand display`).not.toBe("none");
    expect(state.nav.right, `${where} track past the viewport`).toBeLessThanOrEqual(state.vw + 0.5);
    expect(state.nav.x, `${where} track left`).toBeGreaterThanOrEqual(-0.5);
    near(state.nav.right, state.vw - state.padR, `${where} track right edge`);
    expect(state.nav.y, `${where} track in the header`).toBeGreaterThanOrEqual(0);
    expect(state.nav.y + state.nav.h, `${where} track below the header`).toBeLessThanOrEqual(49);
    for (const hit of state.hits) expect(hit, `${where} segment hit`).toBeGreaterThanOrEqual(44);
    for (const t of state.trunc) {
      if (!t) continue;
      expect(t.sw, `${where} truncated text`).toBeLessThanOrEqual(t.cw + 1);
    }
    const boxes = [state.nav, state.timer, state.pause, state.brand].filter(Boolean);
    for (const b of boxes) {
      expect(b.x, `${where} left overflow`).toBeGreaterThanOrEqual(-0.5);
      expect(b.right, `${where} right overflow`).toBeLessThanOrEqual(state.vw + 0.5);
    }
    if (state.brand && state.timer) {
      expect(state.timer.x - state.brand.right, `${where} brand to timer`).toBeGreaterThanOrEqual(
        8 - 0.5
      );
    }
    if (state.brand && !state.timer) {
      expect(state.nav.x - state.brand.right, `${where} brand to switch`).toBeGreaterThanOrEqual(
        8 - 0.5
      );
    }
    expect(state.names, `${where} segment order`).toEqual(["Journal", "Play"]);
    expect(state.buttons[0].x, `${where} Journal left of Play`).toBeLessThan(state.buttons[1].x);
    near(state.buttons[0].x + state.buttons[0].w, state.buttons[1].x, `${where} segment seam`);
    if (state.icons) {
      near(state.buttons[0].w, state.buttons[1].w, `${where} icon segment width`);
      near(state.buttons[0].h, state.buttons[1].h, `${where} icon segment height`);
    }
  }

  for (const width of widths) {
    test(`Play and Journal fit at ${width} with a reserved timer`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      /** @type {Record<number, { play: Awaited<ReturnType<typeof headerState>>, journal: Awaited<ReturnType<typeof headerState>> }>} */
      const shots = {};
      for (const elapsed of [0, 3725, 59999]) {
        await page.goto(`./?elapsed=${elapsed}&freeze`);
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await expect(page.locator(".board > .cell")).toHaveCount(81);
        const label = elapsed === 0 ? "0:00" : elapsed === 3725 ? "62:05" : "999:59";
        await expect(page.locator(".timer2 b")).toHaveText(label);
        const play = await headerState(page);
        assertFit(play, width, "Play");
        if (play.icons) {
          await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute(
            "title",
            "Play"
          );
          await expect(page.getByRole("button", { name: "Journal", exact: true })).toHaveAttribute(
            "title",
            "Journal"
          );
        }
        await page.getByRole("button", { name: "Journal", exact: true }).click();
        await expect(page.locator(".journal")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Sudoku" })).toBeAttached();
        const journal = await headerState(page);
        assertFit(journal, width, "Journal");
        nearRect(journal.nav, play.nav, `${width} switch Play vs Journal at ${label}`);
        expect(journal.icons, `${width} icon step`).toBe(play.icons);
        expect(journal.brandHidden, `${width} brand step`).toBe(play.brandHidden);
        shots[elapsed] = { play, journal };
      }
      nearRect(shots[59999].play.nav, shots[0].play.nav, `${width} switch 0:00 vs 999:59`);
      nearRect(shots[59999].journal.nav, shots[0].journal.nav, `${width} journal switch stable`);
      expect(shots[59999].play.icons).toBe(shots[0].play.icons);
      expect(shots[59999].play.brandHidden).toBe(shots[0].play.brandHidden);
      if (width <= 389) {
        near(shots[59999].play.timer.w, shots[0].play.timer.w, `${width} timer slot`);
      }
    });
  }
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
      "none"
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
