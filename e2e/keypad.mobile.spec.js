// Keypad r2 on the iPhone viewport: show, double-tap fill, swipe-down lock,
// lock-mode taps, two-finger hold, the legacy option, and the cue clock.
import { test, expect } from "@playwright/test";
import { cell, openBoard, expectValue, DEMO_PUZZLE } from "./helpers.js";
import { touchDriver } from "./touch.js";

const key = (page, d) => page.locator(`.key[data-d="${d}"]`);
const pad = (page) => page.locator("#keypad");

/** Empty cells whose Auto notes include d. */
async function cellsWithNote(page, d) {
  return page.evaluate((digit) => {
    return [...document.querySelectorAll(".board > .cell")]
      .filter(
        (el) => !el.dataset.value && (el.getAttribute("data-notes") || "").includes(String(digit))
      )
      .map((el) => Number(el.dataset.i));
  }, d);
}

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("a tap shows the digit and a later tap hides it, without changing the board", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  const notes = await cell(page, 0).getAttribute("data-notes");
  await t.tap(key(page, 4));
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(key(page, 4)).toHaveClass(/shown/);
  await expect(page.locator(".pad-hint")).toContainText("4");
  await expect(page.locator(".pad-hint")).toContainText("Double-tap fills");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", notes);

  await page.waitForTimeout(350);
  await t.tap(key(page, 4));
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await page.waitForTimeout(150);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await page.waitForTimeout(250);
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await expectValue(page, 0, 0);
});

test("double-tap fills the focused cell and does not clear it", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.doubleTap(key(page, 4));
  await expectValue(page, 0, 4);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await t.doubleTap(key(page, 4));
  await expectValue(page, 0, 4);

  await page.locator(".hd-brand").click();
  await expect(cell(page, 0)).not.toHaveClass(/selected/);
  await t.doubleTap(key(page, 6));
  await expect(page.locator(".toast")).toHaveText("Select a cell, then double-tap");
  await expectValue(page, 0, 4);
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
});

test("swipe down locks at 28px, a 20px drag and a retreat under 22px do not", async ({ page }) => {
  const t = await touchDriver(page);
  await t.swipeDown(key(page, 5), 20);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(key(page, 5)).not.toHaveClass(/locked/);

  const k = key(page, 5);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y + 30);
  await expect(k).toHaveClass(/arm-lock/);
  await expect(k.locator(".label.bottom")).toHaveText("Release: lock");
  await t.move(p.x, p.y + 20);
  await expect(k).not.toHaveClass(/arm-lock/);
  await t.end(p.x, p.y + 20);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");

  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "5");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");
  await expect(k).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad-hint")).toContainText("5 locked");
  await expect(page.locator(".pad-hint")).toContainText("Tap 5 to unlock");
});

test("a locked digit toggles empty cells, and given or filled cells only toast", async ({
  page,
}) => {
  const t = await touchDriver(page);
  const ids = (await cellsWithNote(page, 2)).filter((i) => i !== 0);
  expect(ids.length).toBeGreaterThanOrEqual(3);
  const [a, b, c] = ids;
  await t.tap(cell(page, b));
  await t.swipeDown(key(page, 2), 40);

  await t.tap(cell(page, a));
  await t.tap(cell(page, b));
  await t.tap(cell(page, c));
  await expect(cell(page, b)).toHaveClass(/selected/);
  for (const i of [a, b, c]) {
    await expect(cell(page, i)).not.toHaveAttribute("data-notes", /2/);
    await expectValue(page, i, 0);
  }
  await t.tap(cell(page, a), { holdMs: 30 });
  await page.waitForTimeout(40);
  await t.tap(cell(page, a), { holdMs: 30 });
  await expectValue(page, a, 0);
  await expect(cell(page, a)).not.toHaveAttribute("data-notes", /2/);
  await expect(cell(page, b)).toHaveClass(/selected/);

  for (let n = 0; n < 5; n++) await t.tap(page.locator("#undo"));
  for (const i of [a, b, c]) {
    await expect(cell(page, i)).toHaveAttribute("data-notes", /2/);
  }

  await t.tap(key(page, 2));
  await t.tap(cell(page, b));
  await t.doubleTap(key(page, 4));
  await expectValue(page, b, 4);
  await t.tap(cell(page, a));
  await t.swipeDown(key(page, 3), 40);
  await t.tap(cell(page, b));
  await expect(page.locator(".toast")).toHaveText("3 locked — tap an empty cell");
  await expectValue(page, b, 4);
  await expect(cell(page, a)).toHaveClass(/selected/);
  await t.tap(cell(page, 1));
  await expect(page.locator(".toast")).toHaveText("3 locked — tap an empty cell");
  await expectValue(page, 1, 5);
  await expect(cell(page, a)).toHaveClass(/selected/);

  await t.tap(key(page, 3));
  await t.swipeDown(key(page, 5), 40);
  const notes = await cell(page, 0).getAttribute("data-notes");
  await t.tap(cell(page, 0));
  await expect(page.locator(".toast")).toHaveText("Can't place 5 — already in row, column or box");
  await expect(cell(page, 0)).not.toHaveClass(/blocked/);
  await expect(cell(page, 1)).toHaveClass(/blocked/);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", notes || "");
  await expectValue(page, 0, 0);
});

test("lock clears by key tap, another digit, swipe, Escape, pause, More and restart", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.doubleTap(key(page, 4));
  await t.swipeDown(key(page, 5), 40);

  await t.tap(key(page, 5));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");
  await expectValue(page, 0, 4);

  await t.swipeDown(key(page, 5), 40);
  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");

  await t.swipeDown(key(page, 5), 40);
  await t.swipeDown(key(page, 3), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "3");

  await t.tap(key(page, 6));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await expectValue(page, 0, 4);

  await t.swipeDown(key(page, 6), 40);
  await page.keyboard.press("Escape");
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator("#pause"));
  await expect(page.locator(".paused-cover")).toBeVisible();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await t.tap(page.locator("#resume"));

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator(".tools [data-more]"));
  await expect(page.locator("dialog.opts")).toBeVisible();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await page.locator("#opts-done").click();

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator(".tools [data-more]"));
  await page.locator("#opt-restart").click();
  await page.locator("#confirm-ok").click();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
});

test("two-finger hold toggles candidates as one undo step", async ({ page }) => {
  const t = await touchDriver(page);
  const ids = await cellsWithNote(page, 2);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [a, b] = ids;
  await t.tap(cell(page, a));
  await t.holdAndTap(key(page, 2), [cell(page, a), cell(page, b)], {
    beforeRelease: async () => {
      await expect(key(page, 2)).toHaveClass(/holding/);
      await expect(key(page, 2).locator(".label:not(.bottom)")).toHaveText("Tap cells: candidate");
    },
  });
  await expect(cell(page, a)).toHaveClass(/selected/);
  await expect(cell(page, a)).not.toHaveAttribute("data-notes", /2/);
  await expect(cell(page, b)).not.toHaveAttribute("data-notes", /2/);
  await t.tap(page.locator("#undo"));
  await expect(cell(page, a)).toHaveAttribute("data-notes", /2/);
  await expect(cell(page, b)).toHaveAttribute("data-notes", /2/);
  await expect(page.locator("#undo")).toBeDisabled();
});

test("legacy tap-to-fill is off by default, then a tap fills and a second tap clears", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await expect(page.locator(".pad-hint")).toHaveText(
    "Tap = show · Double-tap = fill · Swipe ↑ candidate, ↓ lock"
  );
  await t.tap(page.locator(".tools [data-more]"));
  const row = page.locator("#opt-tap-fill");
  await expect(row).toHaveAttribute("aria-checked", "false");
  await expect(row).toContainText("Tap to fill");
  await expect(page.locator("#tap-fill-desc")).toHaveText("Off: tap shows, double-tap fills");
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await page.locator("#opts-done").click();
  await expect(page.locator(".pad-hint")).toHaveText("Tap = answer · Swipe up = candidate");

  await t.tap(cell(page, 0));
  await t.tap(key(page, 4));
  await expectValue(page, 0, 4);
  await t.tap(key(page, 4));
  await expectValue(page, 0, 0);

  await page.reload();
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await expect(page.locator(".pad-hint")).toHaveText("Tap = answer · Swipe up = candidate");
  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "5");
});

test("screen-reader activation of a key fills, including in legacy mode", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await key(page, 4).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);
  await key(page, 4).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);

  await t.tap(page.locator(".tools [data-more]"));
  await page.locator("#opt-tap-fill").click();
  await page.locator("#opts-done").click();
  await t.tap(page.locator("#erase"));
  await expectValue(page, 0, 0);
  await key(page, 7).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 7);
  await key(page, 7).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 7);
});

test("showing a digit does not restart the cue; a fill or note toggle does", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  const t = await touchDriver(page);

  await page.clock.runFor(20_000);
  await t.tap(key(page, 4));
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expectValue(page, 0, 0);
  await page.clock.runFor(10_000);
  await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");

  await t.tap(cell(page, 0));
  await t.swipeUp(key(page, 2), 60);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
  await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
  await page.clock.runFor(20_000);
  await t.doubleTap(key(page, 4));
  await expectValue(page, 0, 4);
  await page.clock.runFor(10_000);
  await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
  await page.clock.runFor(20_000);
  await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
});

test("the first-run coach shows once", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("kp-coach-cleared")) return;
    localStorage.removeItem("sudoku-keypad-coach");
    sessionStorage.setItem("kp-coach-cleared", "1");
  });
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  const coach = page.locator(".coach");
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("New way to use the keys");
  await expect(coach).toContainText("Highlights this digit and its candidates");
  await expect(coach).toContainText("Locks it; tap empty cells to toggle candidates");
  await expect(coach).toContainText("Double-tap");
  await page.locator("#coach-ok").click();
  await expect(coach).toHaveCount(0);
  await page.reload();
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await expect(page.locator(".coach")).toHaveCount(0);
});
