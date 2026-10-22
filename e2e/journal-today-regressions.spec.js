import { test, expect } from "@playwright/test";
import { touchDriver } from "./touch.js";

const NOW = new Date("2026-10-21T12:00:00");
const SPOKEN = "October 2026, latest puzzles Wed, Oct 21";

// Watch every polite region, so a second announcement source cannot hide behind
// assertions that only inspect the explicit return status.
async function watch(page) {
  await page.evaluate(() => {
    const journal = document.querySelector(".journal");
    const previous = new Map();
    const tracks = new Set();
    const log = { announcements: [], tracks: 0, sheets: 0 };
    window.__regressionLog = log;
    const regions = () => [...journal.querySelectorAll('[aria-live="polite"], [role="status"]')];
    for (const region of regions()) previous.set(region, region.textContent.trim());
    new MutationObserver(() => {
      for (const region of regions()) {
        const text = region.textContent.trim();
        if (text && previous.get(region) !== text) log.announcements.push(text);
        previous.set(region, text);
      }
      for (const track of journal.querySelectorAll(".track")) tracks.add(track);
      log.tracks = tracks.size;
      if (document.querySelector('[role="dialog"]')) log.sheets++;
    }).observe(journal, { childList: true, subtree: true, characterData: true });
  });
}

async function clearLog(page) {
  await page.evaluate(() => {
    window.__regressionLog.announcements = [];
  });
}

async function expectCardAnnouncement(page) {
  const cardText = await page.locator(".ctx").textContent();
  await expect
    .poll(() => page.evaluate(() => window.__regressionLog.announcements))
    .toEqual([cardText.trim()]);
}

for (const mobile of [false, true]) {
  for (const reduced of [false, true]) {
    test(`selection announcements occur once on ${mobile ? "mobile" : "desktop"}, reduced motion ${reduced}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await page.clock.install({ time: NOW });
      await page.goto("./");
      await watch(page);
      const grid = mobile ? ".mgrid" : ".dgrid";
      for (const day of ["09", "10"]) {
        await clearLog(page);
        await page.locator(`${grid} button[data-d="2026-10-${day}"]`).click();
        await expectCardAnnouncement(page);
        if (mobile) await page.getByRole("button", { name: "Close", exact: true }).click();
      }
      // Reselect the same date: mobile reopens it, desktop toggles it off.
      await clearLog(page);
      await page.locator(`${grid} button[data-d="2026-10-10"]`).click();
      await expectCardAnnouncement(page);
      if (mobile) await page.getByRole("button", { name: "Close", exact: true }).click();
      const header = page.locator(mobile ? ".mhead" : ".dmhead");
      await header.getByRole("button", { name: "Previous month" }).click();
      await expect(page.locator(".track")).toHaveCount(0);
      // Select away as well, so resetting the card would expose double speech.
      await page.locator(`${grid} button[data-d="2026-09-10"]`).click();
      if (mobile) await page.getByRole("button", { name: "Close", exact: true }).click();
      await clearLog(page);
      await header.locator(".month-title").click();
      await expect(header).toContainText("October");
      await expect
        .poll(() => page.evaluate(() => window.__regressionLog.announcements))
        .toEqual([SPOKEN]);
      expect(await page.evaluate(() => window.__regressionLog.tracks)).toBe(reduced ? 0 : 2);
      if (mobile) {
        // Latest from away must announce only the return, even as it opens a sheet.
        await header.getByRole("button", { name: "Previous month" }).click();
        await expect(page.locator(".track")).toHaveCount(0);
        await clearLog(page);
        await page.locator(".latest").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        expect(await page.evaluate(() => window.__regressionLog.announcements)).toEqual([SPOKEN]);
      }
    });
  }
}

for (const trigger of ["title", "icon", "Latest away", "Latest home", "T", "Back to latest"]) {
  test(`held touch drag blocks ${trigger}, then release restores it`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install({ time: NOW });
    await page.goto("./");
    const home = trigger === "Latest home";
    if (!home) {
      await page.locator(".mhead").getByRole("button", { name: "Previous month" }).click();
      await expect(page.locator(".track")).toHaveCount(0);
    }
    if (trigger === "Back to latest") {
      await page.setViewportSize({ width: 1280, height: 844 });
      await page.locator('.dgrid button[data-d="2026-09-10"]').click();
      await page.setViewportSize({ width: 390, height: 844 });
    }
    // Only the mobile viewport has touch handlers; the desktop grid has no mouse
    // drag handler. For desktop triggers, retain this real drag across a resize
    // to exercise their shared swiping state without faking application events.
    const touch = await touchDriver(page);
    const box = await page.locator(".mobile .viewport").boundingBox();
    const x = box.x + 90;
    const y = box.y + 80;
    await touch.start(x, y);
    await touch.move(x + 35, y);
    await expect(page.locator(".mgrid.swiping")).toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 35, 0)"
    );
    const desktop = trigger === "T" || trigger === "Back to latest";
    if (desktop) await page.setViewportSize({ width: 1280, height: 844 });
    const header = page.locator(desktop ? ".dmhead" : ".mhead");
    const activate = async () => {
      if (trigger === "T") {
        await header.locator(".month-title").focus();
        await page.keyboard.press("T");
      } else if (trigger.startsWith("Latest")) {
        await page.locator(".latest").focus();
        await page.keyboard.press("Enter");
      } else if (trigger === "Back to latest") {
        await page.locator(".back button").focus();
        await page.keyboard.press("Enter");
      } else if (trigger === "icon") {
        await header.locator(".return-icon").dispatchEvent("click", { bubbles: true });
      } else {
        await header.locator(".month-title").focus();
        await page.keyboard.press("Enter");
      }
    };
    await watch(page);
    try {
      await activate();
      // Wait past a whole return duration to catch queued actions or late sheets.
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => window.__regressionLog.tracks)).toBe(0);
      expect(await page.evaluate(() => window.__regressionLog.sheets)).toBe(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(header).toContainText(home ? "October" : "September");
      await expect(page.locator(".mgrid.swiping")).toHaveCount(1);
    } finally {
      await touch.end(x + 35, y);
    }
    await expect(page.locator(".swiping, .track")).toHaveCount(0);
    await expect(page.locator(".mgrid")).toHaveCSS("transform", "none");
    await activate();
    await expect(header).toContainText("October");
    if (trigger.startsWith("Latest")) await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => window.__regressionLog.tracks)).toBe(home ? 0 : 1);
  });
}
