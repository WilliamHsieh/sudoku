// Short phones shrink the board; below the minimum layout, the body can scroll.
import { test, expect } from "@playwright/test";

const VIEWS = [
  { width: 390, height: 844 },
  { width: 390, height: 667 },
  { width: 390, height: 664 },
  { width: 1280, height: 800 },
];

const EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
  });
});

async function pageBox(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    return {
      scrollH: se.scrollHeight,
      scrollW: se.scrollWidth,
      innerH: innerHeight,
      innerW: innerWidth,
    };
  });
}

async function expectNoPageOverflow(page) {
  const box = await pageBox(page);
  expect(box.scrollH, "page scrollHeight").toBeLessThanOrEqual(box.innerH);
  expect(box.scrollW, "page scrollWidth").toBeLessThanOrEqual(box.innerW);
}

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function settleMotion(page, selector) {
  await page.locator(selector).evaluate(async (el) => {
    const animations = el.getAnimations({ subtree: true });
    await Promise.all(animations.map((anim) => anim.finished));
  });
}

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function expectInsideViewport(page, selector) {
  const b = await page.locator(selector).boundingBox();
  expect(b, selector).toBeTruthy();
  const vp = page.viewportSize();
  expect(b.y, `${selector} top`).toBeGreaterThanOrEqual(-1);
  expect(b.x, `${selector} left`).toBeGreaterThanOrEqual(-1);
  expect(b.y + b.height, `${selector} bottom`).toBeLessThanOrEqual(vp.height + 1);
  expect(b.x + b.width, `${selector} right`).toBeLessThanOrEqual(vp.width + 1);
}

test.describe("native shell", () => {
  for (const vp of VIEWS) {
    test(`play, pause, options, and journal fit ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      const mobile = vp.width < 600;

      await page.goto("./?shot=1&freeze");
      await expect(page.locator(".board > .cell")).toHaveCount(81);
      await expectNoPageOverflow(page);
      await expectInsideViewport(page, ".board");
      if (mobile) {
        await expectInsideViewport(page, ".hd");
        await expectInsideViewport(page, ".keypad");
        await expectInsideViewport(page, ".tools");
        await expectInsideViewport(page, ".pad-hint");
        expect((await page.locator(".key").first().boundingBox()).height).toBe(64);
      } else {
        await expectInsideViewport(page, ".header");
      }

      const board = await page.locator(".board").boundingBox();
      if (vp.width === 390 && vp.height === 844) {
        expect(board.width).toBeCloseTo(374, 0);
        expect(board.height).toBeCloseTo(374, 0);
        expect(board.y).toBeCloseTo(54, 0);
      }
      if (vp.width === 1280) {
        expect(board.width).toBeCloseTo(650, 0);
        expect(board.height).toBeCloseTo(650, 0);
        const header = await page.locator(".header").boundingBox();
        expect(header.x).toBeCloseTo(0, 0);
        expect(header.width).toBeCloseTo(1280, 0);
        expect(header.height).toBeCloseTo(64, 0);
        // The shared segmented header from #42 keeps its 64px bar.
        // The board still sits one 24px margin under the rule.
        expect(board.y).toBeCloseTo(header.y + header.height + 24, 0);
      }
      if (mobile && vp.height < 750) {
        expect(Math.abs(board.width - board.height)).toBeLessThan(1);
        expect(board.width).toBeLessThan(360);
        expect(board.y).toBeGreaterThanOrEqual(54);
      }

      await page.locator("#pause").click();
      await expect(page.locator(".paused-cover")).toBeVisible();
      await settleMotion(page, ".paused-cover");
      await expectNoPageOverflow(page);
      await expectInsideViewport(page, ".paused-cover");
      const cover = await page.locator(".paused-cover").boundingBox();
      const boardNow = await page.locator(".board").boundingBox();
      expect(Math.abs(cover.width - boardNow.width)).toBeLessThan(1);
      expect(Math.abs(cover.height - boardNow.height)).toBeLessThan(1);

      await page.locator("#resume").click();
      await page.locator("[data-more]").filter({ visible: true }).first().click();
      await expect(page.locator("dialog.opts")).toBeVisible();
      await settleMotion(page, "dialog.opts");
      await expectNoPageOverflow(page);
      await expectInsideViewport(page, "dialog.opts");
      await page.locator("#opts-done").click();
      await expect(page.locator("dialog.opts")).toBeHidden();

      await page.goto("./?freeze");
      await expect(page.locator(".journal")).toBeVisible();
      await expectNoPageOverflow(page);
      if (mobile) {
        await expectInsideViewport(page, ".hd");
        await expectInsideViewport(page, ".journal");
        await expect(page.locator(".mobile")).toHaveCSS("overscroll-behavior", "contain");
      } else {
        await expectInsideViewport(page, ".header");
        await expect(page.locator(".page.desktop")).toHaveCSS("overscroll-behavior", "contain");
      }
    });
  }

  test("short journal lists scroll inside the page, not the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto("./?freeze");
    await expect(page.locator(".journal")).toBeVisible();
    const scroll = await page.locator(".mobile").evaluate((el) => ({
      overflow: el.scrollHeight - el.clientHeight,
      behavior: getComputedStyle(el).overscrollBehavior,
    }));
    expect(scroll.overflow).toBeGreaterThan(0);
    expect(scroll.behavior).toBe("contain");
    await expectNoPageOverflow(page);
  });

  test("reduced motion makes sheet, dialog, pause, and month transitions instant", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./?shot=1&freeze");
    await page.locator("#pause").click();
    await expect(page.locator(".paused-cover")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".board")).toHaveCSS("visibility", "hidden");
    await page.locator("#resume").click();

    await page.locator("[data-more]").filter({ visible: true }).first().click();
    await expect(page.locator("dialog.opts")).toHaveCSS("animation-name", "none");
    const backdrop = await page.locator("dialog.opts").evaluate((el) => {
      return getComputedStyle(el, "::backdrop").animationName;
    });
    expect(backdrop).toBe("none");
    await page.locator("#opt-restart").click();
    await expect(page.locator("dialog.confirm")).toHaveCSS("animation-name", "none");
    await page.locator("#confirm-cancel").click();
    await page.locator("#opts-done").click();

    await page.goto("./?freeze");
    await page.locator(".mobile .day.is-latest").click();
    await expect(page.locator(".sheet")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".scrim")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".mgrid")).toHaveCSS("transition-duration", "0s");
  });

  test("overlays ease out in about 260ms when motion is allowed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?shot=1&freeze");
    await page.locator("#pause").click();
    const cover = await page.locator(".paused-cover").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, e: cs.animationTimingFunction };
    });
    expect(cover.d).toBe("0.26s");
    expect(cover.e).toBe(EASE);

    await page.locator("#resume").click();
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    const coverOut = await page.locator(".paused-leave").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, e: cs.animationTimingFunction, name: cs.animationName };
    });
    expect(coverOut.name).toContain("cover-out");
    expect(coverOut.d).toBe("0.26s");
    expect(coverOut.e).toBe(EASE);
    await expect(page.locator(".paused-cover")).toHaveCount(0);

    await page.locator("[data-more]").filter({ visible: true }).first().click();
    const sheet = await page.locator("dialog.opts").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, e: cs.animationTimingFunction, name: cs.animationName };
    });
    expect(sheet.d).toBe("0.26s");
    expect(sheet.e).toBe(EASE);
    expect(sheet.name).toContain("sheet-up");
    await page.locator("#opts-done").click();
    await expect(page.locator("dialog.opts")).toHaveClass(/closing/);
    const closing = await page.locator("dialog.opts").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, e: cs.animationTimingFunction, name: cs.animationName };
    });
    expect(closing.name).toContain("sheet-down");
    expect(closing.d).toBe("0.26s");
    expect(closing.e).toBe(EASE);
    await expect(page.locator("dialog.opts")).toBeHidden();

    await page.goto("./?freeze");
    await page.locator(".mobile .day.is-latest").click();
    await expect(page.locator(".sheet")).toBeVisible();
    const daySheet = await page.locator(".sheet").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, e: cs.animationTimingFunction, name: cs.animationName };
    });
    expect(daySheet.name).toContain("sheet-up");
    expect(daySheet.d).toBe("0.26s");
    expect(daySheet.e).toBe(EASE);
    await page.locator(".sheet").getByRole("button", { name: "Close" }).click();
    await expect(page.locator(".sheet")).toHaveClass(/closing/);
    const dayOut = await page.locator(".sheet").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { d: cs.animationDuration, name: cs.animationName };
    });
    expect(dayOut.name).toContain("sheet-down");
    expect(dayOut.d).toBe("0.26s");
    await expect(page.locator(".sheet")).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("./?shot=1&freeze");
    await page.locator("[data-more]").filter({ visible: true }).first().click();
    const pop = await page
      .locator("dialog.opts")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(pop).toContain("pop");
    await page.locator("#opts-done").click();
    await expect(page.locator("dialog.opts")).toHaveClass(/closing/);
    const popOut = await page
      .locator("dialog.opts")
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(popOut).toContain("pop-out");
    await expect(page.locator("dialog.opts")).toBeHidden();
  });

  test("the dim stays up while Restart confirm replaces the sheet", async ({ page }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("./?shot=1&freeze");
      await page.locator("[data-more]").filter({ visible: true }).first().click();
      const scrim = page.locator(".modal-scrim");
      await expect(scrim).toHaveCSS("opacity", "1");

      await page.evaluate(() => {
        const el = document.querySelector(".modal-scrim");
        window.__scrim = [];
        window.__scrimStop = false;
        const sample = () => {
          if (window.__scrimStop) return;
          window.__scrim.push(Number(getComputedStyle(el).opacity));
          requestAnimationFrame(sample);
        };
        sample();
      });
      await page.locator("#opt-restart").click();
      await page.waitForTimeout(420);
      await page.locator("#confirm-cancel").click();
      await page.waitForTimeout(420);
      await page.locator("#opt-restart").click();
      await page.waitForTimeout(40);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(420);
      const minOpacity = await page.evaluate(() => {
        window.__scrimStop = true;
        return Math.min(...window.__scrim);
      });
      expect(minOpacity, `${vp.width}x${vp.height} scrim`).toBeGreaterThanOrEqual(0.99);
      await expect(page.locator("dialog.opts")).toBeVisible();
      await expect(page.locator("dialog.confirm")).toBeHidden();
      await expect(scrim).toHaveCSS("opacity", "1");
    }
  });

  test("confirm exit is an 180ms opacity fade, with the sheet or the scrim", async ({ page }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("./?shot=1&freeze");
      await page.locator("[data-more]").filter({ visible: true }).first().click();
      await page.locator("#opt-restart").click();
      await expect(page.locator("dialog.confirm")).toBeVisible();
      await expect(page.locator("dialog.opts")).toBeHidden();

      const cancel = await page.evaluate(async () => {
        const samples = [];
        let stop = false;
        const tick = () => {
          if (stop) return;
          const confirm = document.querySelector("dialog.confirm");
          const scrim = document.querySelector(".modal-scrim");
          samples.push({
            confirm: confirm ? Number(getComputedStyle(confirm).opacity) : 0,
            scrim: Number(getComputedStyle(scrim).opacity),
          });
          requestAnimationFrame(tick);
        };
        tick();
        document.querySelector("#confirm-cancel").click();
        await new Promise((r) => requestAnimationFrame(r));
        const confirm = document.querySelector("dialog.confirm");
        const sheet = document.querySelector("dialog.opts");
        const fade = confirm.getAnimations().find((anim) => {
          const frames = /** @type {KeyframeEffect} */ (anim.effect).getKeyframes();
          return frames.some((frame) => "opacity" in frame);
        });
        const timing = fade ? /** @type {KeyframeEffect} */ (fade.effect).getTiming() : null;
        const frames = fade
          ? /** @type {KeyframeEffect} */ (fade.effect)
              .getKeyframes()
              .map((frame) => ({ opacity: frame.opacity, transform: frame.transform }))
          : [];
        const sheetRate = sheet.getAnimations().map((anim) => anim.playbackRate);
        await new Promise((r) => setTimeout(r, 240));
        stop = true;
        return {
          duration: timing && timing.duration,
          easing: timing && timing.easing,
          frames,
          sheetRate,
          scrimClass: document.querySelector(".modal-scrim").className,
          minScrim: Math.min(...samples.map((s) => s.scrim)),
          confirmDropped: samples.some((s) => s.confirm < 0.9),
        };
      });
      expect(cancel.duration, `${vp.width} duration`).toBe(180);
      expect(cancel.easing, `${vp.width} easing`).toBe(EASE);
      expect(cancel.frames.map((frame) => Number(frame.opacity))).toEqual([1, 0]);
      expect(
        cancel.frames.every((frame) => frame.transform == null || frame.transform === "none")
      ).toBe(true);
      expect(
        cancel.sheetRate.some((rate) => rate === 1),
        `${vp.width} forward sheet rise`
      ).toBe(true);
      expect(cancel.minScrim, `${vp.width} scrim`).toBeGreaterThanOrEqual(0.99);
      expect(cancel.confirmDropped, `${vp.width} confirm fade`).toBe(true);
      await expect(page.locator("dialog.confirm")).toBeHidden();
      await expect(page.locator("dialog.opts")).toBeVisible();
      await expect(page.locator(".modal-scrim")).toHaveCSS("opacity", "1");

      await page.locator("#opt-restart").click();
      await expect(page.locator("dialog.confirm")).toBeVisible();
      const restart = await page.evaluate(async () => {
        document.querySelector("#confirm-ok").click();
        await new Promise((r) => requestAnimationFrame(r));
        const confirm = document.querySelector("dialog.confirm");
        const scrim = document.querySelector(".modal-scrim");
        const fade = confirm.getAnimations().find((anim) => anim.playState === "running");
        const scrimCs = getComputedStyle(scrim);
        return {
          confirmRunning: !!fade && fade.effect.getTiming().duration === 180,
          scrimOn: scrim.classList.contains("on"),
          scrimDuration: scrimCs.transitionDuration,
          opacity: Number(scrimCs.opacity),
        };
      });
      expect(restart.confirmRunning, `${vp.width} restart fade`).toBe(true);
      expect(restart.scrimOn, `${vp.width} scrim leaves with the confirm`).toBe(false);
      expect(restart.scrimDuration).toBe("0.26s");
      await expect(page.locator("dialog.confirm")).toBeHidden();
      await expect(page.locator(".modal-scrim")).toHaveCSS("opacity", "0");
    }
  });

  test("option switches move in 160ms", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?shot=1&freeze");
    await page.locator("[data-more]").filter({ visible: true }).first().click();
    const opt = await page
      .locator("dialog.opts .knob")
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { d: cs.transitionDuration, e: cs.transitionTimingFunction };
      });
    expect(opt.d).toBe("0.16s");
    expect(opt.e).toBe(EASE);
  });

  test("pause cover fades over the board and resume fades it back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?shot=1&freeze");
    await page.evaluate(() => {
      window.__coverGaps = [];
      window.__coverStop = false;
      const tick = () => {
        if (window.__coverStop) return;
        const cover = document.querySelector(".paused-cover, .paused-leave");
        const board = document.querySelector(".board");
        if (cover && board) {
          const opacity = Number(getComputedStyle(cover).opacity);
          const hidden = getComputedStyle(board).visibility === "hidden";
          if (opacity < 0.98 && hidden) window.__coverGaps.push(opacity);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    await page.locator("#pause").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".board")).toHaveCSS("visibility", "hidden");
    await page.locator("#resume").click();
    await page.waitForTimeout(400);
    await expect(page.locator(".paused-cover, .paused-leave")).toHaveCount(0);
    await expect(page.locator(".board")).toHaveCSS("visibility", "visible");
    const gaps = await page.evaluate(() => {
      window.__coverStop = true;
      return window.__coverGaps;
    });
    expect(gaps).toEqual([]);
  });

  test("cells and buttons do not select or highlight; keys keep their gesture touch-action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("./?shot=1&freeze");
    const touch = await page.evaluate(() => {
      const cell = getComputedStyle(document.querySelector(".cell"));
      const key = getComputedStyle(document.querySelector(".key"));
      const hint = getComputedStyle(document.querySelector(".pad-hint"));
      const root = getComputedStyle(document.documentElement);
      return {
        cellSelect: cell.userSelect,
        cellTouch: cell.touchAction,
        keyTouch: key.touchAction,
        hintSelect: hint.userSelect,
        overscroll: root.overscrollBehaviorY,
      };
    });
    expect(touch.cellSelect).toBe("none");
    expect(touch.cellTouch).toBe("none");
    expect(touch.keyTouch).toBe("none");
    expect(touch.hintSelect).not.toBe("none");
    expect(touch.overscroll).toBe("none");

    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta).toContain("viewport-fit=cover");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f5f4f0");
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')
    ).toHaveAttribute("content", "default");
  });

  test("standalone keeps browser-tab geometry at every viewport", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    for (const vp of [
      { width: 390, height: 844 },
      { width: 390, height: 667 },
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 1280, height: 800 },
      { width: 800, height: 200 },
    ]) {
      await page.setViewportSize(vp);
      for (const query of ["shot=1&freeze", "freeze"]) {
        await cdp.send("Emulation.setEmulatedMedia", { features: [] });
        await page.goto(`./?${query}`);
        const browser = await shellGeometry(page);
        await cdp.send("Emulation.setEmulatedMedia", {
          features: [{ name: "display-mode", value: "standalone" }],
        });
        await page.goto(`./?${query}&standalone=1`);
        expect(await shellGeometry(page), `${vp.width}x${vp.height} ${query}`).toEqual(browser);
        await expect(page.locator(".standalone-bar")).toHaveCount(0);
      }
    }
  });

  test("short windows can scroll every cell and Resume fully into view", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 200 });
    for (const standalone of [false, true]) {
      await page.goto(`./?shot=1&freeze${standalone ? "&standalone=1" : ""}`);
      await expect(page.locator(".board > .cell")).toHaveCount(81);
      for (const cell of await page.locator(".board > .cell").all()) {
        await expectScrollableTarget(cell);
      }
      expect(await page.locator("body").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await page.locator("#pause").click();
      await settleMotion(page, ".paused-cover");
      await expectScrollableTarget(page.locator("#resume"));
    }
  });

  test("journal last row and legend scroll fully into view, including a 6-row month", async ({
    page,
  }) => {
    for (const vp of VIEWS) {
      await page.setViewportSize(vp);
      await page.goto("./?freeze");
      await expectMonthReachable(page, "October");
      const prev = page.locator("button[aria-label='Previous month']").locator("visible=true");
      await prev.click();
      await expect(visibleTitle(page)).toContainText("September");
      await prev.click();
      await expect(visibleTitle(page)).toContainText("August");
      await expectMonthReachable(page, "August");
      const rows = await page.evaluate(() => {
        const grid = [...document.querySelectorAll(".mgrid, .dgrid")].find(
          (el) => el.getClientRects().length > 0
        );
        const days = [...grid.querySelectorAll(".day")];
        const tops = new Set(days.map((el) => Math.round(el.getBoundingClientRect().top)));
        return tops.size;
      });
      expect(rows, `${vp.width}x${vp.height} August rows`).toBe(6);
    }
  });
});

const SHORT_WIDE = [
  { width: 1280, height: 720 },
  { width: 1280, height: 600 },
  { width: 1024, height: 700 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
];

test("board, tools, and pause Resume fit short wide viewports", async ({ page }) => {
  for (const vp of SHORT_WIDE) {
    await page.setViewportSize(vp);
    await page.goto("./?shot=1&freeze");
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expectFullyInView(page, ".board > .cell");
    if (vp.width < 600) {
      await expectFullyInView(page, ".keypad");
      await expectFullyInView(page, ".tools");
    } else {
      await expectFullyInView(page, ".header");
      await expectFullyInView(page, "#pause");
    }
    await page.locator("#pause").click();
    await expect(page.locator("#resume")).toBeVisible();
    await settleMotion(page, ".paused-cover");
    await expectFullyInView(page, "#resume");
    await expectFullyInView(page, ".board > .cell");
  }
});

test("pause Resume keeps a 44px target inside short boards", async ({ page }) => {
  for (const vp of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 1280, height: 600 },
  ]) {
    await page.setViewportSize(vp);
    await page.goto("./?shot=1&freeze");
    await page.locator("#pause").click();
    await settleMotion(page, ".paused-cover");
    const resume = await page.locator("#resume").boundingBox();
    const board = await page.locator(".board").boundingBox();
    expect(resume.height, `${vp.width}x${vp.height} Resume`).toBeGreaterThanOrEqual(44);
    expect(resume.x).toBeGreaterThanOrEqual(board.x - 1);
    expect(resume.y).toBeGreaterThanOrEqual(board.y - 1);
    expect(resume.x + resume.width).toBeLessThanOrEqual(board.x + board.width + 1);
    expect(resume.y + resume.height).toBeLessThanOrEqual(board.y + board.height + 1);
  }

  await page.setViewportSize({ width: 800, height: 200 });
  await page.goto("./?shot=1&freeze");
  await page.locator("#pause").click();
  await settleMotion(page, ".paused-cover");
  const fit = await page.evaluate(() => {
    const boardEl = document.querySelector(".board");
    const resumeEl = document.querySelector("#resume");
    // The documentElement is the scrollingElement, but its height is the
    // viewport. The short-page overflow scrolls on body.
    let scroller = document.scrollingElement;
    for (let n = boardEl.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) {
        scroller = n;
        break;
      }
    }
    const board = boardEl.getBoundingClientRect();
    const resume = resumeEl.getBoundingClientRect();
    const top = Math.min(board.top, resume.top) + scroller.scrollTop;
    const bottom = Math.max(board.bottom, resume.bottom) + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
    return {
      boardW: board.width,
      boardH: board.height,
      span: bottom - top,
      client: scroller.clientHeight,
    };
  });
  expect(fit.boardW).toBeGreaterThanOrEqual(159.5);
  expect(fit.boardW).toBeLessThanOrEqual(160.5);
  expect(fit.boardH).toBeGreaterThanOrEqual(159.5);
  expect(fit.boardH).toBeLessThanOrEqual(160.5);
  expect(fit.span).toBeLessThanOrEqual(fit.client + 1);
  await expectInsideViewport(page, ".board");
  await expectInsideViewport(page, "#resume");
});

/** @param {import('@playwright/test').Page} page */
function visibleTitle(page) {
  return page.locator(".mhead h1, .dmhead h2").locator("visible=true");
}

/**
 * Scroll the journal scroller so the last day and the legend are fully inside
 * both the scroller and the viewport.
 * @param {import('@playwright/test').Page} page
 * @param {string} month
 */
async function expectMonthReachable(page, month) {
  await expect(visibleTitle(page)).toContainText(month);
  await expectNoPageOverflow(page);
  const mobile = (page.viewportSize()?.width ?? 0) < 600;
  const scroller = page.locator(mobile ? ".mobile" : ".page.desktop");
  const port = await scroller.boundingBox();
  const vp = page.viewportSize();
  expect(port.y + port.height, "journal scroller bottom").toBeGreaterThan(vp.height - 2);
  expect(port.y + port.height).toBeLessThanOrEqual(vp.height + 1);

  const last = page.locator(".mgrid .day, .dgrid .day").locator("visible=true").last();
  await last.scrollIntoViewIfNeeded();
  await expectBoxInside(page, last, scroller);
  const legend = page.locator(mobile ? ".mobile .legend" : ".legend.dleg");
  await legend.scrollIntoViewIfNeeded();
  await expectBoxInside(page, legend, scroller);
}

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function expectFullyInView(page, selector) {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => getComputedStyle(el).display !== "none" && el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          w: r.width,
          h: r.height,
        };
      })
  );
  expect(boxes.length, selector).toBeGreaterThan(0);
  for (const r of boxes) {
    expect(r.h, selector).toBeGreaterThan(0);
    expect(r.top, selector).toBeGreaterThanOrEqual(-1);
    expect(r.left, selector).toBeGreaterThanOrEqual(-1);
    expect(r.bottom, `${selector} bottom`).toBeLessThanOrEqual(page.viewportSize().height + 1);
    expect(r.right, selector).toBeLessThanOrEqual(page.viewportSize().width + 1);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} target
 * @param {import('@playwright/test').Locator} scroller
 */
async function expectBoxInside(page, target, scroller) {
  const box = await target.boundingBox();
  const port = await scroller.boundingBox();
  const vp = page.viewportSize();
  expect(box).toBeTruthy();
  expect(box.y).toBeGreaterThanOrEqual(port.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(port.y + port.height + 1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
}

/** @param {import('@playwright/test').Page} page */
async function shellGeometry(page) {
  await page.locator("main").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const rect = (selector) => {
      const el = [...document.querySelectorAll(selector)].find(
        (node) => node.getClientRects().length
      );
      return el ? el.getBoundingClientRect().toJSON() : null;
    };
    return {
      board: rect(".board"),
      title: rect(".hd-brand, .header h1"),
      journal: rect(".journal"),
      documentHeight: document.scrollingElement.scrollHeight,
      bodyHeight: document.body.scrollHeight,
      innerHeight,
    };
  });
}

/**
 * @param {import('@playwright/test').Locator} target
 */
async function expectScrollableTarget(target) {
  await target.scrollIntoViewIfNeeded();
  const reachable = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // Scroll extents round to whole CSS pixels; grid tracks can end at a fraction.
    return {
      inside:
        r.left >= -0.5 &&
        r.top >= -0.5 &&
        r.right <= innerWidth + 0.5 &&
        r.bottom <= innerHeight + 0.5,
      hit: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)),
    };
  });
  expect(reachable).toEqual({ inside: true, hit: true });
}
