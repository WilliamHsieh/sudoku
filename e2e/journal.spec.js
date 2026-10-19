import { test, expect } from "@playwright/test";
import { buildHistory, seedHistory } from "./journal-fixtures.js";
import { touchDriver } from "./touch.js";

const NOW = new Date("2026-10-18T12:00:00");

test.describe("desktop journal", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
  });

  test("selected day is fill plus blue ring; latest ink ring drops when selected", async ({
    page,
  }) => {
    const latest = page.locator('.dgrid .day[data-d="2026-10-18"]');
    await expect(latest).toHaveClass(/is-latest/);
    await expect(latest).toHaveClass(/sel/);
    await page.mouse.move(0, 0);
    await expect(latest).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const defaultPaint = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      const after = getComputedStyle(el, "::after");
      return {
        beforeColor: before.borderTopColor,
        beforeW: before.borderTopWidth,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
        inset: after.top,
      };
    });
    const defaultInkDropped =
      defaultPaint.beforeW === "0px" ||
      defaultPaint.beforeColor === "rgba(0, 0, 0, 0)" ||
      defaultPaint.beforeColor === "transparent";
    expect(defaultInkDropped).toBeTruthy();
    expect(defaultPaint.afterW).toBe("3px");
    expect(defaultPaint.afterColor).toBe("rgb(42, 86, 198)");
    expect(defaultPaint.inset).toBe("1px");

    await page.locator('.dgrid .day[data-d="2026-10-15"]').click();
    const sel = page.locator(".dgrid .day.sel");
    await expect(sel).toHaveCount(1);
    await expect(sel).toHaveAttribute("data-d", "2026-10-15");
    await page.mouse.move(0, 0);
    await expect(sel).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const paint = await sel.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      return {
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
        inset: after.top,
      };
    });
    expect(paint.afterW).toBe("3px");
    expect(paint.afterColor).toBe("rgb(42, 86, 198)");
    expect(paint.inset).toBe("1px");
    const latestWhileOther = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      const after = getComputedStyle(el, "::after");
      return {
        sel: el.classList.contains("sel"),
        before: before.borderTopWidth,
        beforeColor: before.borderTopColor,
        after: after.borderTopWidth,
      };
    });
    expect(latestWhileOther.sel).toBe(false);
    expect(latestWhileOther.before).toBe("2px");
    expect(latestWhileOther.beforeColor).toBe("rgb(28, 26, 22)");
    expect(latestWhileOther.after === "0px" || latestWhileOther.after === "").toBeTruthy();

    await latest.click();
    await expect(latest).toHaveClass(/sel/);
    await page.mouse.move(0, 0);
    await expect(latest).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const latestSel = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      const after = getComputedStyle(el, "::after");
      return {
        beforeColor: before.borderTopColor,
        beforeW: before.borderTopWidth,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
      };
    });
    const dropped =
      latestSel.beforeW === "0px" ||
      latestSel.beforeColor === "rgba(0, 0, 0, 0)" ||
      latestSel.beforeColor === "transparent";
    expect(dropped).toBeTruthy();
    expect(latestSel.afterW).toBe("3px");
    expect(latestSel.afterColor).toBe("rgb(42, 86, 198)");
  });

  test("unfinished card lists other days only, with no Resume", async ({ page }) => {
    await expect(page.locator(".ucard")).toBeVisible();
    await expect(page.locator(".ucard .ucount")).toHaveText("1");
    await expect(page.locator(".ulnk")).toHaveCount(1);
    await expect(page.locator(".ucard")).not.toContainText("Resume");
    await expect(page.locator(".ctx .btn-primary")).toHaveCount(1);

    await page.locator(".ulnk").click();
    await expect(page.locator(".dgrid .day.sel")).toHaveAttribute("data-d", "2026-10-15");
    await expect(page.locator(".ctx h2")).toContainText("October 15");
    await expect(page.locator(".ucard .ucount")).toHaveText("1");
    await expect(page.locator(".ulnk")).toContainText("Medium");
    await expect(page.locator(".ulnk")).toContainText("Oct 18");
  });
});

test.describe("desktop unfinished empty", () => {
  test("shows a quiet empty line and no pill", async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("nounf"));
    await page.goto("./");
    await expect(page.locator(".ucard .uempty")).toHaveText("No unfinished puzzles right now.");
    await expect(page.locator(".ucard .ucount")).toHaveCount(0);
    await expect(page.locator(".ulink")).toHaveCount(0);
  });
});

test.describe("mobile journal selected", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selected day stays fill only: no blue ring", async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
    await page.locator('.mobile .day[data-d="2026-10-15"]').click();
    const sel = page.locator(".mobile .day.sel");
    await expect(sel).toHaveCount(1);
    await expect(sel).toHaveAttribute("data-d", "2026-10-15");
    await expect(sel).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const paint = await sel.evaluate((el) => {
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, "::after");
      return {
        outline: cs.outlineStyle,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
      };
    });
    expect(paint.outline === "none" || paint.outline === "").toBeTruthy();
    const afterOff =
      paint.afterW === "0px" ||
      paint.afterW === "" ||
      paint.afterColor === "rgba(0, 0, 0, 0)" ||
      paint.afterColor === "transparent";
    expect(afterOff).toBeTruthy();
  });
});

/** @param {import('@playwright/test').Page} page @param {string} rootSel */
async function armSlideWatch(page, rootSel) {
  await page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    const titleSel = rootSel === ".dcal" ? ".dmhead h2" : ".mhead h1";
    window.__slideLog = [];
    const obs = new MutationObserver(() => {
      const track = root.querySelector(":scope > .track");
      if (!track) return;
      const snap = {
        title: document.querySelector(titleSel).textContent.replace(/\s+/g, " ").trim(),
        left: document.querySelector(".stats h2")?.textContent.replace(/\s+/g, " ").trim() ?? null,
        mobileStat: document.querySelector(".sblock .srow.h span")?.textContent.trim() ?? null,
        right: document.querySelector(".ctx h2")?.textContent.trim() ?? null,
        transition: track.style.transition,
        transform: track.style.transform,
        grids: track.querySelectorAll(".grid").length,
      };
      const log = window.__slideLog;
      const last = log[log.length - 1];
      if (!last || last.transition !== snap.transition || last.transform !== snap.transform)
        log.push(snap);
    });
    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    window.__slideObs = obs;
  }, rootSel);
}

/** @param {import('@playwright/test').Page} page @param {string} rootSel */
async function slideLog(page, rootSel) {
  await page.waitForFunction(
    (sel) => {
      const log = window.__slideLog || [];
      const ran = log.some((s) => String(s.transition).includes("300ms"));
      return ran && !document.querySelector(`${sel} > .track`);
    },
    rootSel,
    { timeout: 2000 }
  );
  return page.evaluate(() => {
    window.__slideObs?.disconnect();
    return window.__slideLog;
  });
}

test.describe("desktop month slide", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
  });

  test("previous month slides in from the left and settles the title", async ({ page }) => {
    await armSlideWatch(page, ".dcal .viewport");
    await page.locator(".dcal").getByRole("button", { name: "Previous month" }).click();
    const log = await slideLog(page, ".dcal .viewport");
    const prep = log.find((s) => s.transition === "none");
    const run = log.find((s) => s.transition.includes("300ms"));
    expect(prep.grids).toBe(2);
    expect(prep.transform).toMatch(/^translateX\(-\d+(\.\d+)?px\)$/);
    expect(prep.title).toMatch(/October\s+2026/);
    expect(prep.left).toMatch(/October by difficulty/);
    expect(run.transition.replace(/\s/g, "")).toMatch(
      /transform300mscubic-bezier\((?:0)?\.22,(?:0)?\.8,(?:0)?\.24,1\)/
    );
    expect(run.transform).toBe("translateX(0px)");
    expect(run.title).toMatch(/October\s+2026/);
    expect(run.left).toMatch(/October by difficulty/);
    expect(run.right).toMatch(/October 18/);
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await expect(page.locator(".stats h2")).toHaveText("September by difficulty");
    await expect(page.locator(".ctx h2")).toContainText("October 18");
    await expect(page.locator(".dcal .viewport > .track")).toHaveCount(0);
    await expect(page.locator('.dgrid .day[data-d="2026-09-15"]')).toBeVisible();
  });

  test("next month slides in from the right", async ({ page }) => {
    await page.locator(".dcal").getByRole("button", { name: "Previous month" }).click();
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await armSlideWatch(page, ".dcal .viewport");
    await page.locator(".dcal").getByRole("button", { name: "Next month" }).click();
    const log = await slideLog(page, ".dcal .viewport");
    const prep = log.find((s) => s.transition === "none");
    const run = log.find((s) => s.transition.includes("300ms"));
    expect(prep.transform).toBe("translateX(0px)");
    expect(prep.title).toMatch(/September\s+2026/);
    expect(run.transform).toMatch(/^translateX\(-\d+(\.\d+)?px\)$/);
    expect(run.title).toMatch(/September\s+2026/);
    expect(run.left).toMatch(/September by difficulty/);
    await expect(page.locator(".dmhead h2")).toHaveText(/October\s+2026/);
    await expect(page.locator(".stats h2")).toHaveText("October by difficulty");
  });

  test("a second month command during the slide is ignored", async ({ page }) => {
    await page.locator(".dcal button[aria-label='Previous month']").evaluate((btn) => {
      btn.click();
      btn.click();
    });
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await expect(page.locator(".dcal .viewport > .track")).toHaveCount(0);
    await expect(page.locator(".dmhead h2")).not.toHaveText(/August/);
  });

  test("bracket keys slide the month", async ({ page }) => {
    await armSlideWatch(page, ".dcal .viewport");
    await page.keyboard.press("[");
    const log = await slideLog(page, ".dcal .viewport");
    expect(log.some((s) => s.transition.includes("300ms"))).toBeTruthy();
    expect(log.every((s) => /October\s+2026/.test(s.title))).toBeTruthy();
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await page.keyboard.press("]");
    await expect(page.locator(".dmhead h2")).toHaveText(/October\s+2026/);
  });

  test("reduced motion swaps the month without a track", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".dcal").getByRole("button", { name: "Previous month" }).click();
    await expect(page.locator(".dcal .viewport > .track")).toHaveCount(0);
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await expect(page.locator(".stats h2")).toHaveText("September by difficulty");
  });
});

test.describe("mobile month slide", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
  });

  test("chevron slides the grid and keeps the month title until settle", async ({ page }) => {
    await armSlideWatch(page, ".mobile .viewport");
    await page.locator(".mobile").getByRole("button", { name: "Previous month" }).click();
    const log = await slideLog(page, ".mobile .viewport");
    const run = log.find((s) => s.transition.includes("300ms"));
    expect(run.grids).toBe(2);
    expect(run.title).toMatch(/October\s+2026/);
    expect(run.mobileStat).toMatch(/Oct by difficulty/);
    expect(run.transform).toBe("translateX(0px)");
    await expect(page.locator(".mhead h1")).toHaveText(/September\s+2026/);
    await expect(page.locator(".sblock .srow.h span").first()).toHaveText("Sep by difficulty");
  });

  test("a drag completes as a dual-grid slide from the finger", async ({ page }) => {
    const t = await touchDriver(page);
    const vp = page.locator(".mobile .viewport");
    const box = await vp.boundingBox();
    const y = box.y + 30;
    const x = box.x + box.width / 2;
    await t.start(x, y);
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(16);
      await t.move(x + 20 * i, y);
    }
    const dragging = await vp.locator(":scope > .mgrid").evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      tracks: document.querySelectorAll(".mobile .track").length,
    }));
    expect(dragging.tracks).toBe(0);
    expect(dragging.transform).not.toBe("none");
    await armSlideWatch(page, ".mobile .viewport");
    await t.end(x + 120, y);
    const log = await slideLog(page, ".mobile .viewport");
    const prep = log.find((s) => s.transition === "none");
    const run = log.find((s) => s.transition.includes("300ms"));
    const start = Number(prep.transform.match(/-?\d+(\.\d+)?/)[0]);
    const width = await vp.evaluate((el) => el.clientWidth);
    expect(prep.grids).toBe(2);
    expect(start).toBeLessThan(0);
    expect(start).toBeGreaterThan(-width);
    expect(run.transform).toBe("translateX(0px)");
    expect(run.title).toMatch(/October\s+2026/);
    await expect(page.locator(".mhead h1")).toHaveText(/September\s+2026/);
  });
});
