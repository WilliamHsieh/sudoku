import { test, expect } from "@playwright/test";

const NOW = new Date("2026-10-21T12:00:00");
const LATEST = "2026-10-21";
const SPOKEN = "October 2026, latest puzzles Wed, Oct 21";

/** @param {import('@playwright/test').Page} page @param {boolean} mobile */
async function watchReturn(page, mobile) {
  await page.evaluate((mobile) => {
    const root = document.querySelector(mobile ? ".mobile .viewport" : ".dcal .viewport");
    const status = document.querySelector('.journal [role="status"]');
    const log = { tracks: [], announcements: [], snapshots: [] };
    window.__homeLog = log;
    new MutationObserver(() => {
      const track = root.querySelector(":scope > .track");
      if (!track) return;
      if (!log.tracks.includes(track)) log.tracks.push(track);
      log.snapshots.push({
        title: document.querySelector(mobile ? ".mhead h1" : ".dmhead h2").textContent.trim(),
        card: document.querySelector(".ctx .kicker").textContent.trim(),
        grids: [...track.querySelectorAll(".grid")].map((grid) => ({
          dates: [...grid.querySelectorAll("button.day")].map((el) => el.dataset.d),
          selected: grid.querySelector(".sel")?.getAttribute("data-d") ?? null,
        })),
        transform: track.style.transform,
        transition: track.style.transition,
        sheet: !!document.querySelector('[role="dialog"]'),
      });
    }).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    new MutationObserver(() => {
      if (status.textContent) log.announcements.push(status.textContent);
    }).observe(status, { childList: true, subtree: true, characterData: true });
  }, mobile);
}

/** @param {import('@playwright/test').Page} page @param {boolean} mobile @param {number} [count] */
async function backMonths(page, mobile, count = 2) {
  const header = page.locator(mobile ? ".mhead" : ".dmhead");
  for (let i = 0; i < count; i++) {
    await header.getByRole("button", { name: "Previous month" }).click();
    await expect(page.locator(".track")).toHaveCount(0);
  }
}

for (const mobile of [false, true]) {
  test.describe(`${mobile ? "mobile" : "desktop"} back to today`, () => {
    test.use({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      hasTouch: mobile,
    });

    test.beforeEach(async ({ page }) => {
      await page.clock.install({ time: NOW });
      await page.goto("./");
    });

    const titleSel = mobile ? ".mhead .month-title" : ".dmhead .month-title";
    const latestSel = `${mobile ? ".mgrid" : ".dgrid"} button[data-d="${LATEST}"]`;

    test("home title is a stable, focusable, inert button", async ({ page }) => {
      const title = page.locator(titleSel);
      await expect(title).toHaveAttribute("aria-disabled", "true");
      await expect(title).toHaveAttribute("aria-label", "October 2026");
      await expect(title).not.toHaveAttribute("title");
      await expect(title.locator(".return-icon")).toHaveCSS("opacity", "0");
      await title.focus();
      await title.press("Enter");
      await title.evaluate((el) => el.click());
      await expect(title).toBeFocused();
      await expect(page.locator(".track")).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveText("");
      await expect(title).toHaveCSS("cursor", "default");
      await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await title.press("Tab");
      await expect(
        page.locator(mobile ? ".mhead" : ".dmhead").getByRole("button", { name: "Previous month" })
      ).toBeFocused();
    });

    test("title makes one 300ms slide over multiple months, retaining the outgoing selection", async ({
      page,
    }) => {
      await backMonths(page, mobile);
      if (!mobile) await page.locator('.dgrid button[data-d="2026-08-10"]').click();
      const title = page.locator(titleSel);
      await expect(title).toHaveAttribute("aria-label", "Back to October 2026, latest puzzles");
      await expect(title).toHaveAttribute("title", "Back to latest");
      await expect(title.locator(".return-icon")).toHaveCSS("opacity", "1");
      await expect(title.locator("svg")).toHaveAttribute("width", "22");
      await expect(title.locator("svg")).toHaveAttribute("stroke-width", "2.25");
      await page.mouse.move(0, 0);
      await expect(title).toHaveCSS("color", "rgb(28, 26, 22)");
      await watchReturn(page, mobile);
      await title.click();
      await expect(title).toHaveAttribute("aria-disabled", "true");
      // Exercise all go-home triggers synchronously while the slide is active.
      await page.evaluate(() => {
        document.querySelector('.month-title[aria-disabled="true"]').click();
        document.querySelector(".latest").click();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "T" }));
      });
      await expect(page.locator(".track")).toHaveCount(0);
      await expect(title).toHaveText(/October\s+2026/);
      await expect(page.locator(latestSel)).toBeFocused();
      await expect(page.getByRole("status")).toHaveText(SPOKEN);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const result = await page.evaluate(() => ({
        tracks: window.__homeLog.tracks.length,
        announcements: window.__homeLog.announcements,
        snapshots: window.__homeLog.snapshots,
      }));
      expect(result.tracks).toBe(1);
      expect(result.announcements).toEqual([SPOKEN]);
      expect(result.snapshots.every((s) => /August\s+2026/.test(s.title))).toBe(true);
      expect(result.snapshots.every((s) => s.card === "Latest puzzles")).toBe(true);
      const run = result.snapshots.find((s) => /300ms/.test(s.transition));
      expect(run.transition.replace(/\s/g, "")).toMatch(
        /transform300mscubic-bezier\(0?\.22,0?\.8,0?\.24,1\)/
      );
      expect(run.transform).toMatch(/^translateX\(-[\d.]+px\)$/);
      expect(run.grids).toHaveLength(2);
      expect(run.grids[0].dates.every((d) => d.startsWith("2026-08"))).toBe(true);
      expect(run.grids[1].dates.every((d) => d.startsWith("2026-10"))).toBe(true);
      if (!mobile) {
        expect(run.grids[0].selected).toBe("2026-08-10");
        expect(run.grids[1].selected).toBe(LATEST);
        await expect(page.locator(".ctx .jump")).toBeVisible();
      }
      await expect(page.locator(".ctx[aria-live]")).toHaveCount(0);
      await expect(page.locator('.journal [aria-live="polite"]')).toHaveCount(1);
    });

    test("reduced motion cuts home without a track or icon fade", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await backMonths(page, mobile);
      await watchReturn(page, mobile);
      await expect(page.locator(`${titleSel} .return-icon`)).toHaveCSS("transition-duration", "0s");
      await page.locator(titleSel).click();
      await expect(page.locator(titleSel)).toHaveText(/October\s+2026/);
      await expect(page.locator(`${titleSel} .return-icon`)).toHaveCSS("opacity", "0");
      await expect(page.locator(latestSel)).toBeFocused();
      const result = await page.evaluate(() => ({
        count: window.__homeLog.tracks.length,
        announcements: window.__homeLog.announcements,
      }));
      expect(result).toEqual({ count: 0, announcements: [SPOKEN] });
    });

    test("go-home inputs during a normal month slide do not queue", async ({ page }) => {
      await watchReturn(page, mobile);
      await page
        .locator(mobile ? ".mhead" : ".dmhead")
        .getByRole("button", { name: "Previous month" })
        .click();
      await page.locator(titleSel).evaluate((el) => {
        el.click();
        document.querySelector(".latest").click();
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
      });
      await expect(page.locator(".track")).toHaveCount(0);
      await expect(page.locator(titleSel)).toHaveText(/September\s+2026/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => window.__homeLog.announcements)).toEqual([]);
    });
  });
}

test.describe("desktop home selection and shortcuts", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.goto("./");
  });

  test("same-month title and T clear selection without sliding, and repeated announcements occur once per action", async ({
    page,
  }) => {
    await watchReturn(page, false);
    const title = page.locator(".dmhead .month-title");
    for (const key of [null, "t", "T"]) {
      await page.locator('.dgrid button[data-d="2026-10-09"]').click();
      await expect(title).not.toHaveAttribute("aria-disabled");
      await expect(title.locator(".return-icon")).toHaveCSS("opacity", "1");
      if (key) await page.keyboard.press(key);
      else await title.click();
      await expect(title).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator(`.dgrid button[data-d="${LATEST}"]`)).toBeFocused();
      await expect(page.locator(".ctx .jump")).toBeVisible();
    }
    expect(await page.evaluate(() => window.__homeLog.tracks.length)).toBe(0);
    expect(await page.evaluate(() => window.__homeLog.announcements)).toEqual([
      SPOKEN,
      SPOKEN,
      SPOKEN,
    ]);
    await page.locator(`.dgrid button[data-d="${LATEST}"]`).click();
    await expect(title).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("t");
    expect(await page.evaluate(() => window.__homeLog.announcements.length)).toBe(3);
  });

  test("Esc only deselects; T then slides home; card hint and legend name the correct keys", async ({
    page,
  }) => {
    await backMonths(page, false, 1);
    await page.locator('.dgrid button[data-d="2026-09-10"]').click();
    await expect(page.locator(".back kbd")).toHaveText("T");
    await page.keyboard.press("Escape");
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");
    await expect(page.locator(".dgrid .sel")).toHaveCount(0);
    await page.keyboard.press("T");
    await expect(page.locator(".dmhead h2")).toHaveText(/October\s+2026/);
    await expect(page.getByRole("button", { name: "Go to latest" })).toHaveCount(0);
    await expect(page.locator(".keys")).toContainText("T today");
    await expect(page.locator(".keys")).toContainText("Esc deselect");
    const rows = await page
      .locator(".keys > span")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
    expect(new Set(rows).size).toBe(1);
    const legendWidth = await page
      .locator(".keys")
      .evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(legendWidth[0]).toBeLessThanOrEqual(legendWidth[1]);
  });

  test("Back to latest uses the same multi-month slide", async ({ page }) => {
    await backMonths(page, false);
    await page.locator('.dgrid button[data-d="2026-08-10"]').click();
    await watchReturn(page, false);
    await page.getByRole("button", { name: "Back to latest", exact: true }).click();
    await expect(page.locator(".dmhead h2")).toHaveText(/October\s+2026/);
    expect(await page.evaluate(() => window.__homeLog.tracks.length)).toBe(1);
    expect(await page.evaluate(() => window.__homeLog.announcements)).toEqual([SPOKEN]);
  });

  test("T ignores modifiers, editable focus, composition and an open dialog", async ({ page }) => {
    await page.locator('.dgrid button[data-d="2026-10-09"]').click();
    await page.locator(".dmhead .month-title").evaluate((el) => {
      for (const options of [
        { metaKey: true },
        { ctrlKey: true },
        { altKey: true },
        { isComposing: true },
      ])
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true, ...options }));
    });
    for (const tag of ["input", "textarea", "select", "div"]) {
      await page.evaluate((tag) => {
        const el = document.createElement(tag);
        if (tag === "div") el.contentEditable = "true";
        document.body.append(el);
        el.focus();
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "T", bubbles: true }));
        el.remove();
      }, tag);
      await expect(page.locator(".ctx h2")).toContainText("October 9");
    }
    await page.evaluate(() => {
      const dialog = document.createElement("dialog");
      document.body.append(dialog);
      dialog.showModal();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
      dialog.close();
      dialog.remove();
    });
    await expect(page.locator(".ctx h2")).toContainText("October 9");
    await expect(page.getByRole("status")).toHaveText("");
    await page.keyboard.press("t");
    await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");
  });

  test("latest selection and toggling a selected day off hide the icon; arrows across months show it", async ({
    page,
  }) => {
    const icon = page.locator(".dmhead .return-icon");
    const day = page.locator('.dgrid button[data-d="2026-10-09"]');
    await day.click();
    await expect(icon).toHaveCSS("opacity", "1");
    await day.click();
    await expect(icon).toHaveCSS("opacity", "0");
    await page.locator(`.dgrid button[data-d="${LATEST}"]`).click();
    await expect(icon).toHaveCSS("opacity", "0");
    await page.locator('.dgrid button[data-d="2026-10-01"]').click();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".dmhead h2")).toHaveText(/September\s+2026/);
    await expect(icon).toHaveCSS("opacity", "1");
  });
});

test.describe("mobile Latest card", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.goto("./");
  });

  for (const reduced of [false, true]) {
    test(`Latest returns before opening its sheet (reduced motion ${reduced})`, async ({
      page,
    }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      await backMonths(page, true, 1);
      await watchReturn(page, true);
      await page.locator(".latest").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.locator(".mhead h1")).toHaveText(/October\s+2026/);
      await expect(page.locator(".sheet h2")).toContainText("October 21");
      expect(await page.evaluate(() => window.__homeLog.snapshots.every((s) => !s.sheet))).toBe(
        true
      );
      expect(await page.evaluate(() => window.__homeLog.tracks.length)).toBe(reduced ? 0 : 1);
      expect(await page.evaluate(() => window.__homeLog.announcements)).toEqual([SPOKEN]);
    });
  }

  test("Latest at home opens directly; mobile T is ignored and sheet selection does not show the icon", async ({
    page,
  }) => {
    await page.locator('.mgrid button[data-d="2026-10-09"]').click();
    await expect(page.locator(".mhead .return-icon")).toHaveCSS("opacity", "0");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await backMonths(page, true, 1);
    await page.keyboard.press("t");
    await expect(page.locator(".mhead h1")).toHaveText(/September\s+2026/);
    await page.locator(".mhead .month-title").click();
    await expect(page.locator(".mhead h1")).toHaveText(/October\s+2026/);
    await watchReturn(page, true);
    await page.locator(".latest").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => window.__homeLog.tracks.length)).toBe(0);
    expect(await page.evaluate(() => window.__homeLog.announcements)).toEqual([]);
  });
});

for (const width of [599, 600, 1280]) {
  test(`latest in the previous month is home, returning from the future enters from the left at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.install({ time: new Date("2026-11-01T12:00:00") });
    await page.goto("./");
    const mobile = width < 600;
    const header = page.locator(mobile ? ".mhead" : ".dmhead");
    await expect(header.locator(".month-title")).toHaveAttribute("aria-label", "October 2026");
    await header.getByRole("button", { name: "Next month" }).click();
    await expect(header).toContainText("November");
    await expect(header.locator(".month-title")).toHaveAttribute(
      "aria-label",
      "Back to October 2026, latest puzzles"
    );
    await watchReturn(page, mobile);
    await header.locator(".month-title").click();
    await expect(header).toContainText("October");
    const snapshots = await page.evaluate(() => window.__homeLog.snapshots);
    expect(
      snapshots.some((s) => s.transition === "none" && /^translateX\(-/.test(s.transform))
    ).toBe(true);
    expect(
      snapshots.some((s) => /300ms/.test(s.transition) && s.transform === "translateX(0px)")
    ).toBe(true);
    const first = snapshots[0];
    expect(first.grids[0].dates.every((d) => d.startsWith("2026-10"))).toBe(true);
    expect(first.grids[1].dates).toEqual([]);
  });
}

for (const mobile of [true, false]) {
  test(`title and arrows keep their geometry through icon, hover, press and focus states (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await page.clock.install({ time: NOW });
    await page.goto("./");
    const header = page.locator(mobile ? ".mhead" : ".dmhead");
    const title = header.locator(".month-title");
    const text = header.locator(".month-text");
    const prev = header.getByRole("button", { name: "Previous month" });
    const next = header.getByRole("button", { name: "Next month" });
    const geometry = async () => ({
      text: await text.boundingBox(),
      prev: await prev.boundingBox(),
      next: await next.boundingBox(),
    });
    const home = await geometry();
    await title.hover();
    await expect(title).toHaveCSS("color", "rgb(28, 26, 22)");
    await page.mouse.down();
    await expect(title).toHaveCSS("color", "rgb(28, 26, 22)");
    await page.mouse.up();
    expect(await geometry()).toEqual(home);
    if (mobile) await backMonths(page, true, 1);
    else await page.locator('.dgrid button[data-d="2026-10-09"]').click();
    await expect(title.locator(".return-icon")).toHaveCSS("opacity", "1");
    const away = await geometry();
    expect(away.prev).toEqual(home.prev);
    expect(away.next).toEqual(home.next);
    expect(away.text.x).toBe(home.text.x);
    expect(away.text.y).toBe(home.text.y);
    if (mobile) expect(away.text.x).toBe(16);
    else expect(away.text).toEqual(home.text);
    const hitHeight = await title.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const x = box.x + box.width / 2;
      let top = null;
      let bottom = null;
      for (let y = box.y - 12; y <= box.bottom + 12; y += 0.5) {
        const hit = document.elementFromPoint(x, y);
        if (hit && el.contains(hit)) {
          top ??= y;
          bottom = y;
        }
      }
      return top === null ? 0 : bottom - top + 0.5;
    });
    expect(hitHeight).toBeGreaterThanOrEqual(40);
    const icon = await title.locator(".return-icon").boundingBox();
    expect(icon.width).toBe(22);
    expect(icon.height).toBe(22);
    expect(icon.x + icon.width + 6).toBeLessThanOrEqual(away.next.x);
    await title.hover();
    await expect(title).toHaveCSS("color", "rgb(93, 88, 79)");
    expect(await geometry()).toEqual(away);
    await page.mouse.down();
    await expect(title).toHaveCSS("color", "rgb(115, 113, 109)");
    await expect(title.locator(".year")).toHaveCSS("color", "rgb(115, 113, 109)");
    expect(await geometry()).toEqual(away);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await title.focus();
    await page.keyboard.press("Shift");
    await expect(title).toHaveCSS("outline-width", "2px");
    await expect(title).toHaveCSS("outline-offset", "3px");
    await expect(title).toHaveCSS("outline-color", "rgb(42, 86, 198)");
    expect(await geometry()).toEqual(away);
  });
}
