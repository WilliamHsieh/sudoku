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
const widths = [390, 1280];

async function layoutIssues(page) {
  return page.evaluate(() => {
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
    for (const card of document.querySelectorAll(".alltime, .ctx, .sheet")) {
      if (!card.getClientRects().length) continue;
      const box = card.getBoundingClientRect();
      for (const element of card.querySelectorAll("*")) {
        const row = element.closest(".prow");
        const rowBox = row?.getBoundingClientRect();
        for (const rect of element.getClientRects()) {
          if (outside(rect, box) || rect.left < 0 || rect.right > innerWidth)
            issues.push(`element outside card or viewport: ${element.className}`);
          if (rowBox && element !== row && outside(rect, rowBox))
            issues.push(`element outside puzzle row: ${element.className}`);
        }
        for (const node of element.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (outside(rect, box) || rect.left < 0 || rect.right > innerWidth)
              issues.push(`text outside card or viewport: ${node.textContent.trim()}`);
            if (rowBox && element !== row && outside(rect, rowBox))
              issues.push(`text outside puzzle row: ${node.textContent.trim()}`);
          }
        }
      }
    }
    for (const label of document.querySelectorAll(".prow .pb, .prow .diff > span")) {
      if (!label.getClientRects().length) continue;
      const range = document.createRange();
      const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      range.selectNodeContents(text);
      const lines = [...range.getClientRects()].filter((rect) => rect.width);
      if (lines.length !== 1) issues.push(`puzzle row label wraps: ${label.textContent.trim()}`);
    }
    // A short final line can strand seconds or a single digit. Check the
    // realistic times in All-time best and every AVG/BEST column.
    for (const value of document.querySelectorAll(
      ".ab b, .srow:not(.h) .num:nth-child(n + 3), .stat:not(.h) .num:nth-child(n + 3), .strip .mm .num"
    )) {
      if (
        !value.getClientRects().length ||
        !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.textContent.trim())
      )
        continue;
      const lines = textRects(value);
      if (lines.length > 1 && lines.at(-1).width < 2 * parseFloat(getComputedStyle(value).fontSize))
        issues.push(`time has a lone trailing fragment: ${value.textContent}`);
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
        // Text ranges include the glyph side bearings, so an 8px range gap
        // conservatively guarantees at least that much visible ink separation.
        // Check both SOLVED→AVG and AVG→BEST for every in-scope fixture.
        if (i >= 2 && row.matches(".srow:not(.h), .stat:not(.h)")) {
          const left = textRects(cells[i - 1]);
          const right = textRects(cells[i]);
          if (right.some((r) => left.some((l) => r.left - l.right < 8 - 0.02)))
            issues.push("statistics ink gap below 8px");
        }
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
    return issues;
  });
}

for (const browserName of ["chromium", "webkit"]) {
  test.describe(`${browserName} Journal statistics`, () => {
    test.use({ journalEngine: browserName });

    for (const seconds of [7, 245, 3599, 3600, 35999, 86399, 359999]) {
      test(`realistic times fit through 99:59:59 (${seconds}s)`, async ({ page }) => {
        await page.clock.install({ time: saturday });
        await page.addInitScript(
          ({ latest, seconds }) => {
            localStorage.setItem(
              "sudoku-solved",
              JSON.stringify({
                [latest]: Object.fromEntries(
                  ["easy", "medium", "hard"].map((diff) => [
                    diff,
                    { completed: true, time: seconds },
                  ])
                ),
              })
            );
          },
          { latest, seconds }
        );
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto("./");
        await expect(page.locator(".srow").filter({ hasText: "Hard" })).not.toContainText("—");
        await page.evaluate(() => document.fonts.ready);
        for (const width of widths) {
          await page.setViewportSize({ width, height: 800 });
          expect(await layoutIssues(page), `${browserName}, ${seconds}s, ${width}px`).toEqual([]);
        }
        await page.setViewportSize({ width: 390, height: 800 });
        await page.locator(".latest").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.clock.runFor(300);
        await page
          .getByRole("dialog")
          .evaluate((element) =>
            Promise.all(element.getAnimations().map((animation) => animation.finished))
          );
        for (const width of widths.filter((width) => width < 600)) {
          await page.setViewportSize({ width, height: 800 });
          expect(await layoutIssues(page), `${browserName} sheet, ${seconds}s, ${width}px`).toEqual(
            []
          );
        }
      });
    }
  });
}
