import { test as base, expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";

// The CI WebKit project only selects options-focus files. Exercise both engines
// here without changing that project's scope or adding platform-specific paths.
const test = base.extend({
  journalEngine: ["chromium", { option: true }],
  page: async ({ playwright, baseURL, journalEngine }, use) => {
    const browser = await playwright[journalEngine].launch();
    try {
      await use(await browser.newPage({ baseURL }));
    } finally {
      await browser.close();
    }
  },
});

const latest = Object.keys(puzzleData).sort().at(-1);
const latestDay = new Date(`${latest}T12:00:00`);
// Keep a Saturday marked "Not yet" as the daily puzzle data grows.
const saturday = new Date(latestDay);
do {
  saturday.setDate(saturday.getDate() + 1);
} while (saturday.getDay() !== 6);
const widths = [
  ...Array.from({ length: 41 }, (_, i) => 320 + i),
  375,
  390,
  599,
  600,
  768,
  800,
  1024,
  1200,
  1201,
  1280,
  1600,
];

async function layoutIssues(page, calendar) {
  return page.evaluate((calendar) => {
    const issues = [];
    const outside = (inner, outer) =>
      inner.left < outer.left - 0.02 ||
      inner.right > outer.right + 0.02 ||
      inner.top < outer.top - 0.02 ||
      inner.bottom > outer.bottom + 0.02;
    const textRects = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].filter((rect) => rect.width);
    };
    const mobile = innerWidth < 600;
    const root = document.querySelector(mobile ? ".mobile" : ".desktop");
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth)
      issues.push("horizontal page overflow");
    // These cards use flex/grid rows rather than the statistics column markup.
    // Check painted text too: an element's box can fit while its digits escape.
    for (const card of root.querySelectorAll(".alltime, .ctx")) {
      if (!card.getClientRects().length) continue;
      const box = card.getBoundingClientRect();
      for (const element of card.querySelectorAll("*")) {
        for (const rect of element.getClientRects()) {
          if (outside(rect, box) || rect.left < 0 || rect.right > innerWidth)
            issues.push(`element outside card or viewport: ${element.className}`);
        }
        for (const node of element.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (outside(rect, box) || rect.left < 0 || rect.right > innerWidth)
              issues.push(`text outside card or viewport: ${node.textContent.trim()}`);
          }
        }
      }
    }
    const heading = root.querySelector(".srow.h > span");
    if (mobile && textRects(heading).length !== 1) issues.push("difficulty heading wraps");
    for (const row of root.querySelectorAll(".srow, .stat, .strip .mm")) {
      if (!row.getClientRects().length) continue;
      const cells = [...row.children];
      for (const cell of cells) {
        if (outside(cell.getBoundingClientRect(), row.getBoundingClientRect()))
          issues.push(`statistics cell outside row: ${cell.textContent}`);
        if (!cell.classList.contains("num")) continue;
        const rects = textRects(cell);
        if (rects.some((rect) => outside(rect, cell.getBoundingClientRect())))
          issues.push(`statistics text outside column: ${cell.textContent}`);
        if (!row.matches(".mm") && /^(1|10):00:00$/.test(cell.textContent) && rects.length !== 1)
          issues.push(`hour-long time wraps: ${cell.textContent}`);
      }
      for (let i = 1; i < cells.length; i++) {
        if (
          textRects(cells[i - 1]).some((left) =>
            textRects(cells[i]).some(
              (right) =>
                left.right > right.left + 0.02 &&
                left.left < right.right - 0.02 &&
                left.bottom > right.top + 0.02 &&
                left.top < right.bottom - 0.02
            )
          )
        )
          issues.push("statistics columns overlap");
      }
    }
    if (!calendar || !mobile) return issues;
    const grid = root.querySelector(".mgrid");
    for (const cell of grid.querySelectorAll(".day")) {
      const box = cell.getBoundingClientRect();
      if (outside(box, grid.getBoundingClientRect()) || cell.scrollWidth > cell.clientWidth)
        issues.push(`calendar cell overflows: ${cell.textContent}`);
      for (const child of cell.children) {
        if (outside(child.getBoundingClientRect(), box))
          issues.push(`calendar content overflows: ${cell.textContent}`);
        if (child.matches(".x") && innerWidth <= 360) {
          const rects = textRects(child);
          if (rects.length !== 1 || rects.some((rect) => outside(rect, box)))
            issues.push(`status label wraps or overflows: ${child.textContent}`);
        }
      }
    }
    return issues;
  }, calendar);
}

for (const browserName of ["chromium", "webkit"]) {
  test.describe(`${browserName} Journal at narrow widths`, () => {
    test.use({ journalEngine: browserName });

    test("calendar labels and heading fit at every width from 320 to 360", async ({ page }) => {
      expect(page.context().browser().browserType().name()).toBe(browserName);
      await page.clock.install({ time: saturday });
      await page.goto("./");
      await page.setViewportSize({ width: 320, height: 800 });
      if (saturday.getMonth() !== latestDay.getMonth()) {
        await page.locator(".mhead").getByRole("button", { name: "Next month" }).click();
        await expect(page.locator(".track")).toHaveCount(0);
      }
      const grid = page.locator(".mgrid");
      await expect(grid.locator(".day")).toHaveCount(
        new Date(saturday.getFullYear(), saturday.getMonth() + 1, 0).getDate()
      );
      await expect(
        grid.locator(".day.future").filter({ hasText: new RegExp(`^${saturday.getDate()}\\b`) })
      ).toContainText("Not yet");
      await page.evaluate(() => document.fonts.ready);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 800 });
        expect(await layoutIssues(page, true), `${browserName}, ${width}px`).toEqual([]);
      }
    });

    for (const hardTime of [7.123456789012345e103, Number.MAX_VALUE]) {
      test(`statistics and cards contain hour-long and extreme times (${hardTime})`, async ({
        page,
      }) => {
        expect(page.context().browser().browserType().name()).toBe(browserName);
        await page.clock.install({ time: saturday });
        await page.addInitScript(
          ({ latest, hardTime }) => {
            localStorage.setItem(
              "sudoku-solved",
              JSON.stringify({
                [latest]: Object.fromEntries(
                  [
                    ["easy", 3600],
                    ["medium", 36000],
                    ["hard", hardTime],
                  ].map(([diff, time]) => [diff, { completed: true, time }])
                ),
              })
            );
          },
          { latest, hardTime }
        );
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto("./");
        await expect(page.locator(".srow").filter({ hasText: "Easy" })).toContainText("1:00:00");
        await expect(page.locator(".srow").filter({ hasText: "Medium" })).toContainText("10:00:00");
        await expect(page.locator(".srow").filter({ hasText: "Hard" })).toContainText(
          /e\+(100|304):/
        );
        await page.evaluate(() => document.fonts.ready);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 800 });
          if (width === 1280) {
            await expect(page.getByRole("region", { name: "All-time bests" })).toBeVisible();
            await expect(page.getByRole("region", { name: "Latest puzzles" })).toBeVisible();
          }
          expect(await layoutIssues(page, false), `${browserName}, ${width}px`).toEqual([]);
        }
      });
    }
  });
}
