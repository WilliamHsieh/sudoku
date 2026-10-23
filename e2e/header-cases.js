import { test, expect } from "@playwright/test";
import { cell, expectValue, openBoard } from "./helpers.js";

const NOW = new Date("2026-10-23T12:00:00").getTime();
async function freeze(page) {
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW + 1000);
}
const pill = (page) => page.locator("#time-control");
const time = (page) => page.locator("#header-time");
const box = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

/** Capture Play as it mounts, before its entrance can finish in wall time. */
async function watchSheetArrival(page) {
  await page.evaluate(() => {
    const log = { cleanFrames: 0, arrival: null };
    window.__sheetArrival = log;
    const clean = () =>
      !document.querySelector(".sheet, .scrim.on") &&
      !document.body.classList.contains("journal-sheet");
    const observer = new MutationObserver(() => {
      const play = document.querySelector(".play");
      if (!play) return;
      log.arrival = {
        clean: clean(),
        journal: !!document.querySelector(".journal-view"),
        animations: play.getAnimations().map((animation) => ({
          duration: animation.effect.getTiming().duration,
          easing: getComputedStyle(play).animationTimingFunction,
          frames: animation.effect.getKeyframes().map(({ opacity, transform }) => ({
            opacity,
            x: new DOMMatrix(transform).m41,
          })),
        })),
        transform: getComputedStyle(play).transform,
        opacity: getComputedStyle(play).opacity,
      };
      observer.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    const frame = () => {
      if (log.arrival) return;
      if (clean()) log.cleanFrames++;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function expectSheetArrival(page, testInfo, slide) {
  await page.clock.runFor(500);
  await expect(page.locator(".sheet, .scrim.on")).toHaveCount(0);
  await expect(page.locator(".board")).toBeVisible();
  const log = await page.evaluate(() => window.__sheetArrival);
  expect(log.cleanFrames).toBeGreaterThanOrEqual(2);
  expect(log.arrival.clean).toBe(true);
  expect(log.arrival.journal).toBe(false);
  if (slide) {
    expect(log.arrival.animations).toEqual([
      {
        duration: 260,
        easing: "cubic-bezier(0.22, 0.8, 0.24, 1)",
        frames: [
          { opacity: "0", x: 24 },
          { opacity: "1", x: 0 },
        ],
      },
    ]);
  } else {
    expect(log.arrival.animations).toEqual([]);
    expect(log.arrival.transform).toBe("none");
    expect(log.arrival.opacity).toBe("1");
  }
  await testInfo.attach("sheet-arrival", {
    body: JSON.stringify(log, null, 2),
    contentType: "application/json",
  });
}

export function headerCases(mobile) {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: mobile ? 390 : 1280, height: mobile ? 844 : 900 });
    await freeze(page);
  });

  test("date opens selected day without a sheet; frozen C returns with undo and stable geometry", async ({
    page,
  }) => {
    await page.goto("./");
    await pill(page).click();
    await page.clock.runFor(260);
    const empty = page.locator(".cell:not(.given)").first();
    const i = Number(await empty.getAttribute("data-i"));
    await cell(page, i).click();
    await page.keyboard.press("1");
    await expectValue(page, i, 1);
    await page.clock.runFor(224000);
    await expect(time(page)).toHaveText("3:44");
    const before = await box(pill(page));
    await page.locator(".dbtn").click();
    await page.clock.runFor(260);
    await expect(page.locator(".sheet")).toHaveCount(0);
    const selected = page.locator(`${mobile ? ".mgrid" : ".dgrid"} .day.sel`);
    await expect(selected).toHaveAttribute("data-d", "2026-10-23");
    await expect(pill(page)).toHaveAccessibleName("Back to game");
    await expect(pill(page)).not.toHaveAttribute("aria-pressed");
    await expect(pill(page)).toHaveAccessibleDescription("3:44");
    expect(await box(pill(page))).toEqual(before);
    if (mobile) await expect(pill(page)).toBeFocused();
    else await expect(selected).toBeFocused();
    await page.clock.runFor(120000);
    await expect(time(page)).toHaveText("3:44");
    await pill(page).click();
    await page.clock.runFor(260);
    await expect(pill(page)).toHaveAccessibleName("Pause");
    await expect(pill(page)).toBeFocused();
    await page.keyboard.press("Control+z");
    await page.clock.runFor(1000);
    await expectValue(page, i, 0);
    await expect(time(page)).toHaveText("3:45");
    await expect(page.locator("nav.seg, nav.mseg, .timer2, #pause")).toHaveCount(0);
  });

  test("the current game is identified before its first saved second", async ({ page }) => {
    await page.goto("./");
    await pill(page).click();
    await page.locator(".dbtn").click();
    await page.clock.runFor(260);
    await expect(time(page)).toHaveText("0:00");
    if (mobile) {
      await page.locator(".mgrid .day.sel").click();
      await page.clock.runFor(400);
      await expect(
        page
          .locator(".sheet .prow")
          .filter({ hasText: "Easy" })
          .getByRole("button", { name: "Resume" })
      ).toBeVisible();
    } else {
      await expect(page.locator(".cur-tag")).toHaveText("In play · 0:00");
      await expect(
        page.locator(".ctx .prow").filter({ hasText: "Easy" }).getByRole("button")
      ).toHaveCount(0);
    }
  });

  test("P in Journal returns and resumes a manual pause without cover reveal", async ({ page }) => {
    await openBoard(page);
    await pill(page).click();
    await expect(pill(page)).toHaveAccessibleName("Resume");
    await page.locator(".dbtn").click();
    await page.clock.runFor(260);
    await page.keyboard.press("p");
    await expect(pill(page)).toHaveAccessibleName("Pause");
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
    await page.clock.runFor(1000);
    await expect(time(page)).toHaveText("0:01");
  });

  test("fresh Journal shows Play, or the most recent unfinished elapsed time", async ({ page }) => {
    await page.goto("./");
    await expect(time(page)).toHaveText("Play");
    await expect(page.locator("#fresh-target")).toHaveCSS("position", "absolute");
    const freshBox = await box(pill(page));
    expect(freshBox.x + freshBox.w).toBeCloseTo(mobile ? 374 : 1248, 1);
    await expect(pill(page)).toHaveAccessibleName("Play");
    await page.evaluate(() =>
      localStorage.setItem(
        "sudoku-progress",
        JSON.stringify({
          "2026-10-22": { hard: { elapsed: 224, filled: 0, empty: 55, updatedAt: 2 } },
          "2026-10-21": { easy: { elapsed: 60, filled: 0, empty: 50, updatedAt: 1 } },
        })
      )
    );
    await page.reload();
    await expect(time(page)).toHaveText("3:44");
    await expect(pill(page)).toHaveAccessibleName("Play");
    await expect(pill(page)).toHaveAccessibleDescription(/Resumes Thursday, October 22, Hard/);
    await page.clock.runFor(60000);
    await expect(time(page)).toHaveText("3:44");
    await pill(page).click();
    await expect(page.locator(".dbtn")).toHaveAccessibleName(
      "Thursday, October 22, Hard. Open Journal on this day"
    );
    await expect(time(page)).toHaveText("3:44");
  });

  test("link puzzle reads Custom puzzle and opens latest without a selection", async ({ page }) => {
    await openBoard(page);
    await expect(page.locator(".dbtn")).toHaveText("Custom puzzle");
    await expect(page.locator(".dbtn .t2")).toHaveCount(0);
    await page.locator(".dbtn").click();
    await page.clock.runFor(260);
    await expect(page.locator(".sheet")).toHaveCount(0);
    if (mobile) await expect(page.locator(".mgrid .sel")).toHaveCount(0);
    await expect(pill(page)).toBeFocused();
  });

  if (!mobile)
    test("desktop Notes, More and C keep their order and pause state", async ({ page }) => {
      await openBoard(page);
      const notes = page.locator("#notes-mode-desktop");
      const more = page.locator(".header .more");
      const n = await box(notes);
      const m = await box(more);
      const c = await box(pill(page));
      expect(m.x - n.x - n.w).toBe(2);
      expect(c.x - m.x - m.w).toBe(10);
      await pill(page).click();
      await expect(notes).toBeDisabled();
      await expect(more).toBeDisabled();
      await page.locator(".dbtn").click();
      await page.clock.runFor(260);
      await expect(notes).toHaveCount(0);
      await pill(page).click();
      await expect(notes).toBeEnabled();
      await expect(more).toBeEnabled();
    });

  if (!mobile)
    test("only the current progress row has In play, in both context cards", async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem(
          "sudoku-progress",
          JSON.stringify({
            "2026-10-23": {
              easy: { elapsed: 224, filled: 0, empty: 50, updatedAt: 2 },
              medium: { elapsed: 90, filled: 0, empty: 50, updatedAt: 1 },
            },
          })
        )
      );
      await page.goto("./");
      await pill(page).click();
      await page.locator(".dbtn").click();
      await page.clock.runFor(260);
      await expect(page.locator(".cur-tag")).toHaveCount(1);
      await expect(page.locator(".cur-tag")).toHaveText("In play · 3:44");
      await expect(
        page
          .locator(".ctx .prow")
          .filter({ hasText: "Medium" })
          .getByRole("button", { name: "Resume" })
      ).toBeVisible();
      await page.locator('.dgrid .day[data-d="2026-10-22"]').click();
      await expect(page.locator(".cur-tag")).toHaveCount(0);
      await page.locator('.dgrid .day[data-d="2026-10-23"]').click();
      await expect(page.locator(".cur-tag")).toHaveCount(1);
    });

  test("long date and 123:45 fit with a 16px gap at all header breakpoints", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        "sudoku-progress",
        JSON.stringify({
          "2026-09-28": { medium: { elapsed: 7425, filled: 0, empty: 50, updatedAt: 1 } },
        })
      )
    );
    await page.goto("./");
    await pill(page).click();
    // Wednesday is the widest weekday; the September 28 puzzle is Monday in 2026.
    await page.locator(".full-date").evaluate((el) => (el.textContent = "Wednesday, September 28"));
    for (const width of mobile ? [320, 359, 360, 390] : [600, 719, 720, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(time(page)).toHaveText("123:45");
      const date = await box(page.locator(".dbtn"));
      const right = await box(page.locator(".header .right"));
      expect(right.x - date.x - date.w, `gap at ${width}`).toBeGreaterThanOrEqual(16);
      expect(right.x + right.w).toBeLessThanOrEqual(width);
      expect(await page.locator(".dbtn").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true
      );
    }
  });

  if (mobile)
    for (const reducedMotion of ["no-preference", "reduce"]) {
      test(`sheet Start closes first, then enters Play (${reducedMotion})`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ reducedMotion });
        await page.goto("./");
        await page.locator(".latest").click();
        await page.clock.runFor(400);
        await watchSheetArrival(page);
        await page
          .locator(".sheet .prow")
          .filter({ hasText: "Medium" })
          .getByRole("button", { name: "Start" })
          .click();
        await expect(page.locator(".board")).toHaveCount(0);
        if (reducedMotion === "no-preference")
          await expect(page.locator(".sheet")).toHaveClass(/closing/);
        await expectSheetArrival(page, testInfo, reducedMotion === "no-preference");
        await expect(page.locator(".dbtn")).toHaveAccessibleName(/Medium/);
      });

      test(`current-game sheet Resume closes first, cuts to Play and keeps undo (${reducedMotion})`, async ({
        page,
      }, testInfo) => {
        await page.emulateMedia({ reducedMotion });
        await page.goto("./");
        await pill(page).click();
        const i = Number(await page.locator(".cell:not(.given)").first().getAttribute("data-i"));
        await cell(page, i).click();
        await page.keyboard.press("1");
        await page.locator(".dbtn").click();
        await page.clock.runFor(260);
        await page.locator(".mgrid .day.sel").click();
        await page.clock.runFor(400);
        await watchSheetArrival(page);
        await page
          .locator(".sheet .prow")
          .filter({ hasText: "Easy" })
          .getByRole("button", { name: "Resume" })
          .click();
        await expect(page.locator(".board")).toHaveCount(0);
        if (reducedMotion === "no-preference")
          await expect(page.locator(".sheet")).toHaveClass(/closing/);
        await expectSheetArrival(page, testInfo, false);
        await page.keyboard.press("Control+z");
        await page.clock.runFor(1000);
        await expectValue(page, i, 0);
      });
    }
}
