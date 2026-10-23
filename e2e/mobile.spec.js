// Mobile input: iPhone viewport + real CDP touch. Demo puzzle cell 0 is empty
// with Auto candidates 2 3 4 6 7; cell 1 is a given 5.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
// 0.5px absorbs subpixel rounding; header fit is strict: gap >= 8, scrollWidth <= clientWidth.
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
    const startTime = new Date("2026-01-01T00:00:00Z");
    await page.clock.install({ time: startTime });
    await page.clock.pauseAt(startTime);
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

  for (const paused of [false, true]) {
    test(`Play → Journal → Play keeps progress and a non-zero ${paused ? "paused" : "running"} timer`, async ({
      page,
    }) => {
      const startTime = new Date("2026-01-01T00:00:00Z");
      await page.clock.install({ time: startTime });
      await page.clock.pauseAt(startTime);
      await openBoard(page);
      const t = await touchDriver(page);
      await t.tap(cell(page, 0));
      await t.doubleTap(key(page, 4));
      await expectValue(page, 0, 4);
      const timer = page.locator(".timer2 b");
      await page.clock.runFor(7_000);
      await expect(timer).toHaveText("0:07");
      if (paused) await page.locator("#pause").click();
      await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", String(paused));

      await t.tap(page.getByRole("button", { name: "Journal", exact: true }));
      await expect(page.locator(".journal")).toBeVisible();
      await expect(page.locator(".board")).toHaveCount(0);
      await t.tap(page.getByRole("button", { name: "Play", exact: true }));
      await expect(page.locator(".board > .cell")).toHaveCount(81);
      await expectValue(page, 0, 4);
      await expect(timer).toHaveText("0:07");
      await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", String(paused));
      await expect(page.locator(".paused-cover")).toHaveCount(paused ? 1 : 0);
      await page.clock.runFor(3_000);
      await expect(timer).toHaveText(paused ? "0:07" : "0:10");
      if (paused) {
        await page.locator("#pause").click();
        await page.clock.runFor(2_000);
        await expect(timer).toHaveText("0:09");
      }
    });
  }

  test("Play with no history opens the first unsolved of the latest day", async ({ page }) => {
    const pick = firstUnsolvedLatest(puzzleData, {});
    expect(pick, "a latest unsolved puzzle exists").toBeTruthy();
    await page.goto("./");
    await expect(page.locator(".journal")).toBeVisible();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    // Daily puzzles can share individual givens with the demo. Check the full board.
    const values = await page
      .locator(".board > .cell")
      .evaluateAll((cells) => cells.map((node) => node.getAttribute("data-value") || "0").join(""));
    expect(values).toBe(pick.puzzle);
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

  function readHeaderState({ sampleFrames = false } = {}) {
    const read = () => {
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
        return {
          w: r.width - parseFloat(after.left) - parseFloat(after.right),
          h: r.height - parseFloat(after.top) - parseFloat(after.bottom),
        };
      });
      return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        padL: parseFloat(getComputedStyle(hd).paddingLeft),
        padR: parseFloat(getComputedStyle(hd).paddingRight),
        timeSlot: getComputedStyle(hd).getPropertyValue("--time-slot"),
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
          // Icon labels are display:none. The hit is the 44px face, not extra text.
          ...buttons.map((el) => {
            const label = el.querySelector(".mseg-label");
            if (label && getComputedStyle(label).display === "none") return null;
            return trunc(el);
          }),
        ],
      };
    };
    if (sampleFrames) {
      window.__fitSamples = [];
      window.__sampleFit = true;
      window.__lateFontLoaded = false;
      Promise.all(
        [...document.fonts]
          .filter((face) => face.family === "LateHeader")
          .map((face) => face.loaded)
      ).then(() => {
        window.__lateFontLoaded = true;
      });
      // rAF runs before ResizeObserver. A raw rAF read can see new glyphs
      // before the app corrects its fit later in the SAME rendering update.
      // Observe a changing sentinel and the probes to retain the last layout
      // of every frame, after the app's observers and before paint.
      const sentinel = document.createElement("div");
      sentinel.style.cssText = "position:fixed;width:1px;height:0;pointer-events:none";
      document.body.appendChild(sentinel);
      let frame = 0;
      const observer = new ResizeObserver(() => {
        queueMicrotask(() => {
          if (!window.__sampleFit) return;
          const sample = {
            ...read(),
            loaded: window.__lateFontLoaded,
            frame,
            at: performance.now(),
          };
          const last = window.__fitSamples.at(-1);
          if (last?.frame === frame) window.__fitSamples[window.__fitSamples.length - 1] = sample;
          else window.__fitSamples.push(sample);
        });
      });
      observer.observe(sentinel);
      for (const probe of document.querySelectorAll(".hd-probe > span")) observer.observe(probe);
      const tick = () => {
        if (!window.__sampleFit) {
          observer.disconnect();
          sentinel.remove();
          return;
        }
        frame++;
        sentinel.style.width = `${1 + (frame % 2)}px`;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    return read();
  }

  async function headerState(page) {
    return page.evaluate(readHeaderState);
  }

  function assertFit(state, width, view) {
    const where = `${view} @ ${width}`;
    // 0.5px overflow/viewport allowances absorb subpixel rounding; strict header fit is checked below.
    expect(state.scrollW, `${where} scrolls horizontally`).toBeLessThanOrEqual(state.vw + 0.5);
    expect(state.padL, `${where} padding-left`).toBeGreaterThanOrEqual(8);
    expect(state.padR, `${where} padding-right`).toBeGreaterThanOrEqual(8);
    expect(state.brandDisplay, `${where} brand display`).not.toBe("none");
    expect(state.nav.right, `${where} track past the viewport`).toBeLessThanOrEqual(state.vw + 0.5);
    expect(state.nav.x, `${where} track left`).toBeGreaterThanOrEqual(-0.5);
    near(state.nav.right, state.vw - state.padR, `${where} track right edge`);
    expect(state.nav.y, `${where} track in the header`).toBeGreaterThanOrEqual(0);
    expect(state.nav.y + state.nav.h, `${where} track below the header`).toBeLessThanOrEqual(49);
    for (const hit of state.hits) {
      expect(hit.w, `${where} segment hit width`).toBeGreaterThanOrEqual(44);
      expect(hit.h, `${where} segment hit height`).toBeGreaterThanOrEqual(44);
    }
    for (const t of state.trunc) {
      if (!t) continue;
      expect(t.sw, `${where} truncated text`).toBeLessThanOrEqual(t.cw);
    }
    const boxes = [state.nav, state.timer, state.pause, state.brand].filter(Boolean);
    for (const b of boxes) {
      expect(b.x, `${where} left overflow`).toBeGreaterThanOrEqual(-0.5);
      expect(b.right, `${where} right overflow`).toBeLessThanOrEqual(state.vw + 0.5);
    }
    if (state.brand && state.timer) {
      expect(state.timer.x - state.brand.right, `${where} brand to timer`).toBeGreaterThanOrEqual(
        8
      );
    }
    if (!state.brand && state.timer) {
      expect(state.timer.x - state.padL, `${where} left of timer`).toBeGreaterThanOrEqual(8);
    }
    if (state.brand && !state.timer) {
      expect(state.nav.x - state.brand.right, `${where} brand to switch`).toBeGreaterThanOrEqual(8);
    }
    expect(state.names, `${where} segment order`).toEqual(["Journal", "Play"]);
    expect(state.buttons[0].x, `${where} Journal left of Play`).toBeLessThan(state.buttons[1].x);
    near(state.buttons[0].x + state.buttons[0].w, state.buttons[1].x, `${where} segment seam`);
    if (state.icons) {
      near(state.buttons[0].w, 44, `${where} icon face width`);
      near(state.buttons[1].w, 44, `${where} icon face width`);
      near(state.buttons[0].h, 26, `${where} icon face height`);
      near(state.buttons[1].h, 26, `${where} icon face height`);
      near(state.nav.w, 92, `${where} icon track width`);
    }
  }

  function overlapArea(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  async function assertTargets(page, where) {
    const result = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll(".mseg button")];
      const pause = document.querySelector("#pause");
      const hitOf = (el) => {
        const r = el.getBoundingClientRect();
        const after = getComputedStyle(el, "::after");
        const left = parseFloat(after.left);
        const right = parseFloat(after.right);
        const top = parseFloat(after.top);
        const bottom = parseFloat(after.bottom);
        const x = r.x + left;
        const y = r.y + top;
        const w = r.width - left - right;
        const h = r.height - top - bottom;
        return { x, y, w, h, right: x + w, bottom: y + h };
      };
      const ownerAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest(".mseg button")?.getAttribute("aria-label") ?? "none";
      };
      const hits = buttons.map(hitOf);
      const samples = buttons.flatMap((el) => {
        const r = el.getBoundingClientRect();
        const hit = hitOf(el);
        const name = el.getAttribute("aria-label");
        const xs = [r.x + 2, r.x + r.width / 2, r.x + r.width - 4];
        const points = xs.map((x) => ({
          name,
          got: ownerAt(x, r.y + r.height / 2),
        }));
        points.push(
          { name, got: ownerAt(hit.x + hit.w / 2, hit.y + 2) },
          { name, got: ownerAt(hit.x + hit.w / 2, hit.bottom - 2) }
        );
        return points;
      });
      const pauseBox = pause?.getBoundingClientRect();
      return {
        hits,
        samples,
        pause: pauseBox
          ? {
              x: pauseBox.x,
              y: pauseBox.y,
              w: pauseBox.width,
              h: pauseBox.height,
              right: pauseBox.right,
              bottom: pauseBox.bottom,
            }
          : null,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
      };
    });
    expect(overlapArea(result.hits[0], result.hits[1]), `${where} hits overlap`).toBe(0);
    // 0.5px hit bounds absorb subpixel rounding; they do not measure header fit.
    for (const hit of result.hits) {
      expect(hit.w, `${where} hit width`).toBeGreaterThanOrEqual(44);
      expect(hit.h, `${where} hit height`).toBeGreaterThanOrEqual(44);
      expect(hit.x, `${where} hit left`).toBeGreaterThanOrEqual(-0.5);
      expect(hit.right, `${where} hit right`).toBeLessThanOrEqual(result.vw + 0.5);
      expect(hit.y, `${where} hit top`).toBeGreaterThanOrEqual(-0.5);
      expect(hit.bottom, `${where} hit bottom`).toBeLessThanOrEqual(result.vh + 0.5);
      if (result.pause) {
        expect(overlapArea(hit, result.pause), `${where} hit meets Pause`).toBe(0);
      }
    }
    for (const sample of result.samples) {
      expect(sample.got, `${where} face pixel`).toBe(sample.name);
    }
  }

  for (const width of [270, ...widths]) {
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
        if (play.icons) await assertTargets(page, `Play @ ${width}`);
        if (play.icons && elapsed === 0) {
          await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute(
            "title",
            "Play"
          );
          await expect(page.getByRole("button", { name: "Journal", exact: true })).toHaveAttribute(
            "title",
            "Journal"
          );
          const journalIcon = await page
            .locator(".mseg button")
            .first()
            .locator("path, rect")
            .evaluateAll((els) =>
              els.map((el) => (el.tagName.toLowerCase() === "rect" ? "rect" : el.getAttribute("d")))
            );
          expect(journalIcon, `${width} Journal icon`).toEqual([
            "M8 2v3",
            "M16 2v3",
            "rect",
            "M3 9h18",
            "M8 13h.01",
            "M12 13h.01",
            "M16 13h.01",
            "M8 17h.01",
            "M12 17h.01",
            "M16 17h.01",
          ]);
        }
        await page.getByRole("button", { name: "Journal", exact: true }).click();
        await expect(page.locator(".journal")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Sudoku" })).toBeAttached();
        const journal = await headerState(page);
        assertFit(journal, width, "Journal");
        if (journal.icons) await assertTargets(page, `Journal @ ${width}`);
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

  async function settle(page) {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        })
    );
  }

  function hasSystemFont(family) {
    try {
      return execFileSync("fc-list", [family, "file"], { encoding: "utf8" }).trim().length > 0;
    } catch {
      return false;
    }
  }

  const CDN = {
    Roboto: {
      600: "https://cdn.jsdelivr.net/fontsource/fonts/roboto@5.2.6/latin-600-normal.woff2",
      700: "https://cdn.jsdelivr.net/fontsource/fonts/roboto@5.2.6/latin-700-normal.woff2",
    },
    Inter: {
      600: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-600-normal.woff2",
      700: "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-700-normal.woff2",
    },
    "Noto Sans": {
      600: "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@5.2.8/latin-600-normal.woff2",
      700: "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@5.2.8/latin-700-normal.woff2",
    },
  };

  const fontDownloads = new Map();

  async function downloaded(url) {
    if (fontDownloads.has(url)) return fontDownloads.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    fontDownloads.set(url, data);
    return data;
  }

  async function useFace(page, family) {
    const quoted = JSON.stringify(family);
    let faces = "";
    const localFile =
      process.env.HEADER_FONT_DIR &&
      {
        Roboto: "Roboto.ttf",
        "Noto Sans": "NotoSans.ttf",
        Inter: "Inter.ttf",
      }[family];
    if (localFile) {
      const data = readFileSync(join(process.env.HEADER_FONT_DIR, localFile)).toString("base64");
      faces = `@font-face{font-family:${quoted};src:url(data:font/ttf;base64,${data});font-weight:100 900;font-display:swap}`;
    } else if (family === "Roboto" || !hasSystemFont(family)) {
      const spec = CDN[family];
      if (!spec) throw new Error(`no source for ${family}`);
      const [w600, w700] = await Promise.all([downloaded(spec[600]), downloaded(spec[700])]);
      const face = (weight, b64) =>
        `@font-face{font-family:${quoted};src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap}`;
      faces = `${face(600, w600)}\n${face(700, w700)}\n`;
    }
    const css = `${faces}.hd,.hd *{font-family:${quoted},sans-serif !important}`;
    await page.evaluate(
      async ({ css, family }) => {
        document.getElementById("fit-face")?.remove();
        const style = document.createElement("style");
        style.id = "fit-face";
        style.textContent = css;
        document.head.appendChild(style);
        const name = family.includes(" ") ? `"${family}"` : family;
        await document.fonts.load(`600 13px ${name}`);
        await document.fonts.load(`700 22px ${name}`);
        await document.fonts.ready;
      },
      { css, family }
    );
  }

  async function watchFace(page, apply) {
    await page.evaluate(() => {
      const hd = document.querySelector(".hd");
      let last = hd.classList.contains("icon-step");
      let flips = 0;
      const obs = new MutationObserver(() => {
        const now = hd.classList.contains("icon-step");
        if (now !== last) {
          flips += 1;
          last = now;
        }
      });
      obs.observe(hd, { attributes: true, attributeFilter: ["class"] });
      window.__iconFlips = () => flips;
    });
    await apply();
    await page.clock.runFor(64);
    return page.evaluate(() => window.__iconFlips());
  }

  test("ticks hold the step and a font load changes it at most once", async ({ page }) => {
    test.setTimeout(60_000);
    const time = new Date("2026-01-01T00:00:00Z");
    await page.clock.install({ time });
    await page.clock.pauseAt(time);

    async function openPlay(elapsed) {
      await page.goto(`./?elapsed=${elapsed}`);
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(page.locator(".board > .cell")).toHaveCount(81);
      await page.clock.runFor(32);
    }

    async function atWidth(width) {
      await page.setViewportSize({ width, height: 844 });
      await page.clock.runFor(32);
      return headerState(page);
    }

    await openPlay(599);
    await expect(page.locator(".timer2 b")).toHaveText("9:59");
    let lo = 260;
    let hi = 390;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const state = await atWidth(mid);
      if (state.icons) lo = mid + 1;
      else hi = mid;
    }
    const textWidth = lo;
    const iconWidth = Math.max(260, lo - 1);
    const textSide = await atWidth(Math.min(textWidth, 389));
    const iconSide = await atWidth(iconWidth);
    if (textWidth <= 389) expect(textSide.icons).toBe(false);
    if (textWidth > 260) expect(iconSide.icons).toBe(true);

    async function tick(from, to, mode) {
      await page.clock.fastForward(1000);
      await expect(page.locator(".timer2 b")).toHaveText(to);
      const state = await headerState(page);
      expect(state.icons, `${from} to ${to}`).toBe(mode.icons);
      expect(state.brandHidden, `${from} to ${to} brand`).toBe(mode.brandHidden);
      nearRect(state.nav, mode.nav, `${from} to ${to}`);
    }

    await openPlay(599);
    await atWidth(iconWidth);
    const iconMode = await headerState(page);
    await page.evaluate(() => {
      window.__fitReads = 0;
      const original = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...args) {
        if (this.matches(".hd-probe-time")) window.__fitReads++;
        return original.apply(this, args);
      };
    });
    await tick("9:59", "10:00", iconMode);
    expect(await page.evaluate(() => window.__fitReads), "tick fit passes").toBe(0);
    for (const view of ["Journal", "Play", "Journal", "Play"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await page.clock.runFor(32);
      nearRect((await headerState(page)).nav, iconMode.nav, `${view} cached track`);
    }
    expect(await page.evaluate(() => window.__fitReads), "view-switch fit passes").toBe(0);
    await page.setViewportSize({ width: iconWidth + 1, height: 844 });
    await page.clock.runFor(32);
    expect(await page.evaluate(() => window.__fitReads), "resize measures again").toBeGreaterThan(
      0
    );
    await openPlay(5999);
    await atWidth(iconWidth);
    await expect(page.locator(".timer2 b")).toHaveText("99:59");
    await tick("99:59", "100:00", iconMode);

    if (textWidth <= 389) await atWidth(textWidth);
    const flips = await watchFace(page, () => useFace(page, "DejaVu Sans"));
    expect(flips, "font load toggles").toBeLessThanOrEqual(1);
    const afterWide = await headerState(page);
    await page.clock.fastForward(1000);
    const afterTick = await headerState(page);
    expect(afterTick.icons).toBe(afterWide.icons);
    expect(await page.evaluate(() => window.__iconFlips())).toBe(flips);
  });

  // Serve bytes from the test. HEADER_FONT_DIR allows offline runs with the
  // verifier's TTFs; CI can use the same in-memory CDN faces as useFace().
  async function lateFontBodies(family) {
    if (family === "DejaVu Sans") {
      expect(hasSystemFont(family), "DejaVu Sans must be installed").toBe(true);
      const file = execFileSync("fc-match", ["-f", "%{file}", "DejaVu Sans:style=Bold"], {
        encoding: "utf8",
      });
      const body = readFileSync(file);
      return { 600: body, 700: body };
    }
    if (process.env.HEADER_FONT_DIR) {
      const file = { Inter: "Inter.ttf", Roboto: "Roboto.ttf", "Noto Sans": "NotoSans.ttf" }[
        family
      ];
      const body = readFileSync(join(process.env.HEADER_FONT_DIR, file));
      return { 600: body, 700: body };
    }
    const [w600, w700] = await Promise.all([
      downloaded(CDN[family][600]),
      downloaded(CDN[family][700]),
    ]);
    return { 600: Buffer.from(w600, "base64"), 700: Buffer.from(w700, "base64") };
  }

  for (const [family, step] of [
    ["Roboto", 274],
    ["Inter", 283],
    ["Noto Sans", 276],
    ["DejaVu Sans", 296],
  ]) {
    test(`late ${family} keeps 8px, full text and the current fit on every frame`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      const bodies = await lateFontBodies(family);
      for (const width of [step - 1, step, step + 1]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("./?elapsed=59999&freeze");
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.evaluate(() => document.fonts.ready);
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const pattern = "**/late-header-font-*.ttf";
        await page.route(pattern, async (route) => {
          await gate;
          const weight = route.request().url().includes("-600.") ? 600 : 700;
          await route.fulfill({ body: bodies[weight], contentType: "font/ttf" });
        });
        const requested = page.waitForRequest(pattern);
        const faces =
          bodies[600] === bodies[700]
            ? `@font-face { font-family: LateHeader; src: url('./late-header-font-600.ttf');
              font-weight: 100 900; font-display: swap; }`
            : [600, 700]
                .map(
                  (weight) => `@font-face { font-family: LateHeader;
              src: url('./late-header-font-${weight}.ttf'); font-weight: ${weight}; font-display: swap; }`
                )
                .join("\n");
        await page.addStyleTag({
          content: `${faces}
          .hd, .hd * { font-family: LateHeader, sans-serif !important; }
        `,
        });
        await requested;
        // Start while the requests are blocked, then retain every rAF through
        // FontFace.loaded, FontFaceSet.ready, and two further animation frames.
        await page.evaluate(readHeaderState, { sampleFrames: true });
        await settle(page);
        expect(
          await page.evaluate(() =>
            [...document.fonts]
              .filter((face) => face.family === "LateHeader")
              .every((face) => face.status === "loading")
          ),
          "real delayed font requests"
        ).toBe(true);
        release();
        await page.evaluate(async () => {
          await Promise.all(
            [...document.fonts]
              .filter((face) => face.family === "LateHeader")
              .map((face) => face.loaded)
          );
          await document.fonts.ready;
        });
        await settle(page);
        const samples = await page.evaluate(() => {
          window.__sampleFit = false;
          return window.__fitSamples;
        });
        await test.info().attach(`${family}-${width}-frames`, {
          body: JSON.stringify(samples),
          contentType: "application/json",
        });
        const final = await headerState(page);
        const loaded = samples.filter((s) => s.loaded);
        expect(
          samples.filter((s) => !s.loaded).length,
          "fallback frames sampled"
        ).toBeGreaterThanOrEqual(2);
        expect(loaded.length, "at least two frames after FontFace.loaded").toBeGreaterThanOrEqual(
          2
        );
        for (const [i, sample] of samples.entries()) {
          const where = `${family} frame ${i}, loaded=${sample.loaded}, t=${sample.at}`;
          assertFit(sample, width, where);
          if (sample.loaded) {
            expect(sample.icons, `${where} uses the settled fit`).toBe(final.icons);
            expect(sample.timeSlot, `${where} reserves the current font's timer slot`).toBe(
              final.timeSlot
            );
          }
        }
        const changes = samples.filter((s, i) => i > 0 && s.icons !== samples[i - 1].icons);
        expect(changes.length, "font load toggles").toBeLessThanOrEqual(1);
        const minGap = Math.min(...samples.map((s) => s.timer.x - (s.brand?.right ?? s.padL)));
        console.log(
          JSON.stringify({
            family,
            width,
            frames: samples.length,
            loadedFrames: loaded.length,
            minGap,
            changes: changes.length,
          })
        );
        await page.unroute(pattern);
      }
    });
  }

  test("four fonts keep 8px and the same track across the text step", async ({ page }) => {
    test.setTimeout(30_000);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("./?elapsed=59999&freeze");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".board > .cell")).toHaveCount(81);

    for (const family of ["Roboto", "Inter", "Noto Sans", "DejaVu Sans"]) {
      await useFace(page, family);
      // Binary search the rendered step; exhaustive 1px arithmetic is covered
      // in header-fit.test.js. Check both views at the edges and at 260/320px.
      const measurements = [];
      let lo = 260;
      let hi = 320;
      while (lo < hi) {
        const width = (lo + hi) >> 1;
        await page.setViewportSize({ width, height: 844 });
        await settle(page);
        if ((await headerState(page)).icons) lo = width + 1;
        else hi = width;
      }
      for (const width of [260, lo - 1, lo, lo + 1, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await settle(page);
        const play = await headerState(page);
        assertFit(play, width, `${family} Play`);
        measurements.push({ width, gap: play.timer.x - (play.brand?.right ?? play.padL) });
        expect(play.icons, `${family} step at ${lo}`).toBe(width < lo);
        await assertTargets(page, `${family} Play @ ${width}`);
        await page.getByRole("button", { name: "Journal", exact: true }).click();
        const journal = await headerState(page);
        assertFit(journal, width, `${family} Journal`);
        await assertTargets(page, `${family} Journal @ ${width}`);
        nearRect(journal.nav, play.nav, `${family} ${width} switch`);
        expect(journal.icons).toBe(play.icons);
        await page.getByRole("button", { name: "Play", exact: true }).click();
      }
      console.log(JSON.stringify({ family, textAt: lo, measurements }));
    }
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
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    for (const d of [3, 4, 6, 7]) {
      await t.swipeUp(key(page, d), 60);
      await page.waitForTimeout(80);
    }
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "2");
    // The last swipe left 7 focused. The lone candidate still fills, and the
    // highlight follows the 2 that landed.

    await t.tap(cell(page, 0), { holdMs: 40 });
    await page.waitForTimeout(120);
    await t.tap(cell(page, 0), { holdMs: 40 });
    await expectValue(page, 0, 2);
    await expect(cell(page, 0)).toHaveClass(/selected/);
    await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "2");
    await expect(page.locator('.key[data-d="2"]')).toHaveClass(/shown/);
    await expect(cell(page, 21)).toHaveClass(/same/);

    await t.tap(page.locator("#undo"));
    await expectValue(page, 0, 0);
    // The fill left 2 highlighted. Clear it so the next double-tap only selects.
    await t.tap(key(page, 2));
    await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");

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
