import { test, expect } from "@playwright/test";
import { puzzleData } from "../src/puzzles.js";
import { newGame, setAnswer } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";

const latest = Object.keys(puzzleData).sort().at(-1);
const puzzle = puzzleData[latest].hard;
const answerIndex = puzzle.indexOf("0");
const snapshot = toSnapshot(setAnswer(newGame(puzzle), answerIndex, 1).state);

async function openLatest(page) {
  // Fix the date without replacing real animation timers or rAF.
  await page.clock.setFixedTime(new Date(`${latest}T12:00:00`));
  await page.addInitScript(
    ({ latest, puzzle, snapshot }) => {
      localStorage.setItem("sudoku-keypad-coach", "1");
      localStorage.setItem(
        "sudoku-progress",
        JSON.stringify({
          [latest]: {
            hard: {
              elapsed: 120,
              filled: 1,
              empty: [...puzzle].filter((x) => x === "0").length,
              updatedAt: Date.now(),
              snapshot,
            },
          },
        })
      );
    },
    { latest, puzzle, snapshot }
  );
  await page.goto("./");
  await page.getByRole("button", { name: /Latest puzzles,/ }).tap();
  const resume = page
    .locator(".sheet .prow")
    .filter({ has: page.getByText("Hard", { exact: true }) })
    .getByRole("button", { name: "Resume", exact: true });
  await expect(resume).toBeVisible();
  return resume;
}

async function watchOrder(page) {
  await page.evaluate(() => {
    const log = {
      tapAt: null,
      removedAt: null,
      playAt: null,
      cleanFrames: [],
      loads: [],
      announced: [],
    };
    window.__sheetPlay = log;
    const status = document.querySelector('.journal [role="status"]');
    new MutationObserver(() => {
      const text = status.textContent.trim();
      if (text) log.announced.push(text);
    }).observe(status, { subtree: true, childList: true, characterData: true });
    document.addEventListener(
      "click",
      (event) => {
        if (log.tapAt === null && event.target.closest(".sheet button"))
          log.tapAt = performance.now();
      },
      true
    );
    const clean = () =>
      !document.querySelector(".sheet, .scrim.on") &&
      !document.body.classList.contains("journal-sheet");
    const sample = () => {
      if (log.tapAt === null) return;
      if (log.removedAt === null && clean()) log.removedAt = performance.now();
      if (log.playAt === null && document.querySelector("#header-time .time")) {
        log.playAt = performance.now();
        log.cleanAtPlay = clean();
      }
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const frame = (at) => {
      sample();
      if (log.playAt !== null) {
        observer.disconnect();
        return;
      }
      if (log.removedAt !== null && clean()) log.cleanFrames.push(at);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    window.addEventListener("loadPuzzle", (event) => {
      log.loads.push({ detail: event.detail, clean: clean() });
    });
  });
}

async function expectResumed(page, testInfo, label) {
  await expect(page.locator("#header-time .time")).toBeVisible();
  await expect(page.locator(".sheet, .scrim.on")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/journal-sheet/);
  await expect(page.locator("#header-time .time")).toHaveText(/^2:0[0-2]$/);
  const values = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.map((cell) => cell.dataset.value || "0").join(""));
  expect(values).toBe(puzzle.slice(0, answerIndex) + "1" + puzzle.slice(answerIndex + 1));
  const log = await page.evaluate(() => window.__sheetPlay);
  expect(log.cleanAtPlay).toBe(true);
  expect(log.removedAt).toBeLessThan(log.playAt);
  expect(log.cleanFrames.length).toBeGreaterThanOrEqual(2);
  expect(log.loads).toEqual([
    {
      clean: true,
      detail: { dateStr: latest, difficulty: "hard", puzzleString: puzzle, fromSheet: true },
    },
  ]);
  // Like an immediate switch to Play, closing the sheet first stays silent.
  expect(log.announced).toEqual([]);
  const delayMs = log.playAt - log.tapAt;
  console.log(`Latest Resume Hard (${label}): tap -> Play ${delayMs.toFixed(1)}ms`);
  await testInfo.attach(`sheet-close-${label}`, {
    body: JSON.stringify({ delayMs, ...log }, null, 2),
    contentType: "application/json",
  });
  return delayMs;
}

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`Latest Resume closes before Play (${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    const resume = await openLatest(page);
    await watchOrder(page);
    await resume.tap();
    await expectResumed(page, testInfo, reducedMotion);
  });
}

test("the 320ms fallback resumes once and ignores a second row tap", async ({ page }, testInfo) => {
  const resume = await openLatest(page);
  await watchOrder(page);
  // Suppress animationend so only the existing fallback can complete the close.
  await page.locator(".sheet").evaluate((sheet) => {
    sheet.addEventListener("animationend", (event) => event.stopImmediatePropagation(), true);
    const buttons = sheet.querySelectorAll(".prow button");
    buttons[2].click();
    buttons[0].click();
  });
  const delay = await expectResumed(page, testInfo, "fallback");
  expect(delay).toBeGreaterThanOrEqual(320);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__sheetPlay.loads.length)).toBe(1);
  // Keep the locator tied to the Hard row to catch fixture/row-order changes.
  await expect(resume).toHaveCount(0);
});

for (const phase of ["closing", "paint-wait"]) {
  test(`switching views during ${phase} cancels the pending load`, async ({ page }) => {
    const resume = await openLatest(page);
    await watchOrder(page);
    if (phase === "paint-wait") {
      await page.evaluate(() => {
        const observer = new MutationObserver(() => {
          if (document.querySelector(".sheet")) return;
          observer.disconnect();
          document.querySelector("#time-control").click();
          queueMicrotask(() => document.querySelector(".dbtn").click());
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
    await resume.tap();
    if (phase === "closing") {
      await page.locator("#time-control").evaluate((el) => el.click());
      await page.locator(".dbtn").evaluate((el) => el.click());
    }
    await expect(page.locator(".journal")).toBeVisible();
    await page.waitForTimeout(600);
    await expect(page.locator(".journal")).toBeVisible();
    expect(await page.evaluate(() => window.__sheetPlay.loads)).toEqual([]);
    await expect(page.locator("body")).not.toHaveClass(/journal-sheet/);
  });
}

for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`a plain Close still announces the latest card (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openLatest(page);
    await watchOrder(page);
    await page.locator(".sheet").getByRole("button", { name: "Close" }).tap();
    await expect(page.locator(".sheet, .scrim.on")).toHaveCount(0);
    const card = (
      await page.locator('.journal section.ctx[aria-label="Latest puzzles"]').textContent()
    ).trim();
    expect(card).toMatch(/^Latest puzzles/);
    await expect(page.locator('.journal [role="status"]')).toHaveText(card);
    expect(await page.evaluate(() => window.__sheetPlay.announced)).toEqual([card]);
  });
}

test("Start and the unfinished-sheet Resume also close before loading", async ({ page }) => {
  await openLatest(page);
  await watchOrder(page);
  await page.locator(".sheet .prow").first().getByRole("button", { name: "Start" }).tap();
  await expect(page.locator(".play")).toBeVisible();
  await expect(page.locator(".sheet, .scrim.on")).toHaveCount(0);
  await expect(page.locator("#header-time .time")).toHaveText(/^0:0[0-2]$/);
  expect(await page.evaluate(() => window.__sheetPlay.announced)).toEqual([]);
  await page.locator(".dbtn").tap();
  await page.getByRole("button", { name: /Unfinished/ }).tap();
  await watchOrder(page);
  await page
    .locator(".sheet .urow")
    .filter({ hasText: "Hard" })
    .getByRole("button", { name: "Resume" })
    .tap();
  await expect(page.locator("#header-time .time")).toBeVisible();
  expect(await page.evaluate(() => window.__sheetPlay.loads)).toEqual([
    {
      clean: true,
      detail: { dateStr: latest, difficulty: "hard", puzzleString: puzzle, fromSheet: true },
    },
  ]);
  expect(await page.evaluate(() => window.__sheetPlay.announced)).toEqual([]);
});
