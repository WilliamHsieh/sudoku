import { test, expect } from "@playwright/test";
import { touchDriver } from "./touch.js";
import { puzzleData } from "../src/puzzles.js";
import { solve } from "./helpers.js";
import { newGame } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";

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

// Resume a real saved puzzle, then keep its selected cell when opening Journal.
// The app's window keyboard handler still accepts moves in Journal. This reaches
// the normal progress/solved store methods while the observed card stays mounted.
async function resumeInJournal(page, date, remaining) {
  const puzzle = puzzleData[date].easy;
  const solution = solve(puzzle);
  const missing = [...puzzle].flatMap((digit, i) => (digit === "0" ? [i] : [])).slice(0, remaining);
  const state = newGame(puzzle);
  state.answers = [...puzzle].map((digit, i) =>
    digit === "0" && !missing.includes(i) ? Number(solution[i]) : 0
  );
  const entry = {
    elapsed: 30,
    filled: state.answers.filter(Boolean).length,
    empty: [...puzzle].filter((digit) => digit === "0").length,
    updatedAt: NOW.getTime(),
    snapshot: toSnapshot(state),
  };
  await page.addInitScript(
    ({ date, entry }) => {
      localStorage.setItem("sudoku-progress", JSON.stringify({ [date]: { easy: entry } }));
    },
    { date, entry }
  );
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);
  await page.goto("./");
  // Play resumes the most recent unfinished puzzle through the app's real path.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".board > .cell").nth(missing[0]).click();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator(".ctx")).toContainText("October 21");
  return solution[missing[0]];
}

async function expectQuiet(page) {
  // A separate browser task lets the store effect, tick and MutationObserver run.
  await page.evaluate(() => new Promise((resolve) => queueMicrotask(resolve)));
  expect(await page.evaluate(() => window.__regressionLog.announcements)).toEqual([]);
}

for (const mobile of [false, true]) {
  for (const kind of ["progress", "solved"]) {
    for (const latest of [false, true]) {
      test(`${mobile ? "mobile" : "desktop"} ${latest ? "latest" : "different"}-day ${kind} update ${latest ? "announces once" : "stays silent"}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
        const date = latest ? "2026-10-21" : "2026-09-10";
        const digit = await resumeInJournal(page, date, kind === "solved" ? 1 : 2);
        const before = await page.locator(".ctx").textContent();
        await watch(page);
        await page.keyboard.press(digit);
        const key = kind === "solved" ? "sudoku-solved" : "sudoku-progress";
        const saved = await page.evaluate(
          ({ key, date }) => JSON.parse(localStorage.getItem(key))[date].easy,
          { key, date }
        );
        if (kind === "solved") expect(saved.completed).toBe(true);
        else expect(saved.empty - saved.filled).toBe(1);
        if (latest) {
          await expectCardAnnouncement(page);
          expect(await page.locator(".ctx").textContent()).not.toBe(before);
        } else {
          expect(await page.locator(".ctx").textContent()).toBe(before);
          await expectQuiet(page);
        }
      });
    }
  }
}

test("an identical progress data copy stays silent", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await resumeInJournal(page, "2026-09-10", 2, false);
  await watch(page);
  const before = await page.evaluate(() => localStorage.getItem("sudoku-progress"));
  // With the clock paused, flushProgress saves a new object with identical data.
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe(before);
  await expectQuiet(page);
  await page.locator('.dgrid button[data-d="2026-10-09"]').click();
  await expectCardAnnouncement(page);
  await clearLog(page);
  await page.locator(".back button").click();
  await expect
    .poll(() => page.evaluate(() => window.__regressionLog.announcements))
    .toEqual([SPOKEN]);
  await clearLog(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expectQuiet(page);
});

for (const mobile of [false, true]) {
  test(`page load and ten clock ticks stay silent on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
    await page.clock.install({ time: NOW });
    await page.clock.pauseAt(NOW);
    await page.addInitScript(() => {
      const previous = new Map();
      window.__loadAnnouncements = [];
      new MutationObserver(() => {
        for (const region of document.querySelectorAll(
          '.journal [aria-live="polite"], .journal [role="status"]'
        )) {
          const text = region.textContent.trim();
          if (previous.has(region) && text && previous.get(region) !== text)
            window.__loadAnnouncements.push(text);
          previous.set(region, text);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto("./");
    await expect(page.locator(".ctx")).toBeAttached();
    expect(await page.evaluate(() => window.__loadAnnouncements)).toEqual([]);
    await watch(page);
    // Run each second, rather than fastForward, which can collapse interval ticks.
    for (let i = 0; i < 10; i++) await page.clock.runFor(1000);
    await expectQuiet(page);
    expect(await page.evaluate(() => window.__loadAnnouncements)).toEqual([]);
  });
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
