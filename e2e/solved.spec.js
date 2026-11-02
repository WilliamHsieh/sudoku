import { test, expect } from "@playwright/test";
import { prepareSolved, finishSolved, blanks } from "./solved-fixture.js";
const sizes = [
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
];
test.use({ colorScheme: "light" });
for (const [width, height] of sizes) {
  test(`solved layout ${width}x${height}, focus, announcement and actions`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepareSolved(page);
    const before = await page.locator(".board").boundingBox();
    await finishSolved(page);
    await expect(page.locator("#sv-h")).toBeFocused();
    await expect(page.locator(".sv-live")).toHaveText(
      "Solved in 6 minutes 42 seconds. 1 minute 28 seconds faster than your Easy average. 4-day streak."
    );
    await expect(page.locator(".sv-time")).toHaveText("6:42");
    await expect(page.locator(".sv-panel dl")).toContainText("−1:28");
    await expect(page.locator(".sv-panel dd").last()).toHaveAttribute(
      "aria-label",
      "1 of 3 solved today"
    );
    await expect(page.locator(".game-controls, #keypad, .auto-slot, .more")).toHaveCount(0);
    await expect(page.locator("#time-control")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("#time-control")).not.toHaveAttribute("aria-pressed");
    await expect(page.locator("#time-control")).not.toHaveAttribute("title");
    await expect(page.locator('.success-message, [role="dialog"]')).toHaveCount(0);
    await page
      .locator(".sv-panel")
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const board = await page.locator(".board").boundingBox();
    expect(board).toEqual(before);
    const panel = await page.locator(".sv-panel").boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(height);
    if (width >= 600) {
      expect(panel.width).toBe(236);
      expect(panel.y).toBe(board.y);
      expect(panel.height).toBe(board.height);
    } else {
      expect(panel.y).toBeCloseTo(440, 0);
    }
    await page.keyboard.press("Tab");
    await expect(page.locator(".sv-next")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator(".sv-journal")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".journal")).toBeVisible();
  });
}
for (const width of [390, 1280])
  test(`every game shortcut and pointer/hold/paint path is inert after solve at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await prepareSolved(page);
    await finishSolved(page);
    await expect(page.locator("#sv-h")).toBeFocused();
    const snapshot = () =>
      page.evaluate(() => ({
        board: [...document.querySelectorAll(".cell")].map((c) => [
          c.getAttribute("data-value"),
          c.getAttribute("data-notes"),
          c.className,
        ]),
        time: document.querySelector("#header-time").textContent,
        progress: localStorage.getItem("sudoku-progress"),
        solved: localStorage.getItem("sudoku-solved"),
        mode: document.querySelector(".board").getAttribute("data-notes-mode"),
      }));
    const before = await snapshot();
    // Includes every branch in handleGlobalKeydown/handleKeydown and Shift-hover.
    for (const key of [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Backspace",
      "Delete",
      "Control+z",
      "Meta+z",
      "Control+Shift+z",
      "Meta+Shift+z",
      "Control+y",
      "Tab",
      "Shift+1",
      "Shift+2",
      "Shift+3",
      "Shift+4",
      "Shift+5",
      "Shift+6",
      "Shift+7",
      "Shift+8",
      "Shift+9",
      "Space",
      "Escape",
      "p",
      "P",
      "Control+1",
      "Alt+2",
      "Meta+3",
    ]) {
      await page.locator("#sv-h").focus();
      await page.keyboard.press(key);
      expect(await snapshot(), key).toEqual(before);
    }
    const cell = page.locator(`.cell[data-i="${blanks.at(-1)}"]`);
    await cell.dispatchEvent("click");
    await cell.dispatchEvent("contextmenu");
    await cell.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 44 });
    await cell.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 44 });
    await cell.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 44 });
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(600, 450, { steps: 10 });
    await page.waitForTimeout(650);
    await page.mouse.up();
    expect(await snapshot()).toEqual(before);
  });
for (const width of [390, 1280])
  test(`Enter from heading and body opens Next with hardware keyboard at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await prepareSolved(page);
    await finishSolved(page);
    await expect(page.locator("#sv-h")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sv-panel")).toHaveCount(0);
    await expect(page.locator(".t2")).toContainText("Medium");
  });
test("body Enter opens Next", async ({ page }) => {
  await prepareSolved(page);
  await finishSolved(page);
  await expect(page.locator("#sv-h")).toBeFocused();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Enter");
  await expect(page.locator(".t2")).toContainText("Medium");
});
test("manual finish fires at 180ms; reduced focus is at S+200, announcement at S+700", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareSolved(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await finishSolved(page);
  await page.clock.runFor(179);
  await expect(page.locator(".sv-panel")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.locator(".sv-panel")).toHaveCount(1);
  await expect(page.locator(".sv-ring")).toHaveCount(0);
  await expect(page.locator(".sv-panel")).toHaveCSS("transform", "none");
  await page.clock.runFor(199);
  await expect(page.locator("#sv-h")).not.toBeFocused();
  await page.clock.runFor(1);
  await expect(page.locator("#sv-h")).toBeFocused();
  await expect(page.locator(".sv-live")).toBeEmpty();
  await page.clock.runFor(500);
  await expect(page.locator(".sv-live")).toContainText("Solved in");
});
test("autofill completion uses the real capped stagger and last origin", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const remaining = await prepareSolved(page, { autofill: true });
  await page.evaluate(() => document.activeElement.blur());
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.keyboard.press("Tab");
  await expect(page.locator(".af-filled")).toHaveCount(remaining.length);
  const lastDelay = await page
    .locator(".af-filled")
    .last()
    .evaluate((el) => parseFloat(el.style.getPropertyValue("--af-delay")));
  expect(lastDelay).toBe(360);
  await page.clock.runFor(lastDelay + 519);
  await expect(page.locator(".sv-panel")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.locator(".sv-panel")).toHaveCount(1);
  const ring = page.locator(".sv-ring");
  await expect(ring).toHaveCSS("pointer-events", "none");
  const origin = await page.locator(`.cell[data-i="${remaining.at(-1)}"]`).boundingBox();
  const board = await page.locator(".board").boundingBox();
  expect(await ring.evaluate((el) => parseFloat(el.style.getPropertyValue("--sv-x")))).toBeCloseTo(
    origin.x + origin.width / 2 - board.x
  );
});
test("longest actual Resume label fits the 236px primary without wrapping", async ({ page }) => {
  await prepareSolved(page, { lastToday: true });
  await finishSolved(page);
  await expect(page.locator("#sv-h")).toBeFocused();
  await expect(page.locator(".sv-next")).toContainText("Resume May 10 · Medium");
  const measured = await page.locator(".sv-next > span").evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
    whiteSpace: getComputedStyle(el).whiteSpace,
  }));
  expect(measured.whiteSpace).toBe("nowrap");
  expect(measured.scroll).toBeLessThanOrEqual(measured.client);
});
