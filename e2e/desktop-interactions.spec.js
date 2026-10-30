import { test, expect } from "@playwright/test";
import { cell, openBoard, expectValue, pencil } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("desktop exposes the same number and editing controls as mobile", async ({ page }) => {
  await expect(page.locator("#keypad")).toBeVisible();
  await expect(page.locator(".tools")).toBeVisible();
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator("#redo")).toBeDisabled();
  await expect(page.locator("#erase")).toBeDisabled();
  await cell(page, 0).click();
  await page.locator('.key[data-d="4"]').dblclick();
  await expectValue(page, 0, 4);
  await page.locator("#undo").click();
  await expectValue(page, 0, 0);
  await page.locator("#redo").click();
  await expectValue(page, 0, 4);
  await page.locator("#erase").click();
  await expectValue(page, 0, 0);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");
});

test("desktop onboarding stays inside the viewport and explains mouse controls", async ({
  page,
}) => {
  await page.goto("./?kp=coach");
  await expect(page.locator(".coach")).toBeVisible();
  await expect(page.locator(".coach")).toContainText("Double-click");
  await expect(page.locator(".coach")).toContainText("Drag up");
  const box = await page.locator(".coach").boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.locator("#coach-ok").click();
  await expect(page.locator(".coach")).toHaveCount(0);
});

test("Shift-click locks the pad digit; Space toggles its note and Enter fills its answer", async ({
  page,
}) => {
  await cell(page, 0).click();
  await page.locator("#time-control").focus();
  await page.locator('.key[data-d="4"]').click({ modifiers: ["Shift"] });
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "4");
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expectValue(page, 0, 0);
  await page.keyboard.press("Space");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "2367");
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await page.locator('.key[data-d="2"]').click({ modifiers: ["Shift"] });
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await page.locator('.key[data-d="2"]').click({ modifiers: ["Shift"] });
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expectValue(page, 0, 4);
});

for (const key of ["Backspace", "Delete", "Digit0"]) {
  test(`${key} erases an answer, then resets only the selected cell's notes`, async ({ page }) => {
    await cell(page, 0).click();
    await pencil(page, 0, 2).click();
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
    await page.keyboard.press("Digit4");
    await page.keyboard.press(key);
    await expectValue(page, 0, 0);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
    await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");
    await page.keyboard.press(key);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
    await expect(cell(page, 0)).toHaveClass(/selected/);
  });
}

test("right-click uses the same two-step erase as the toolbar", async ({ page }) => {
  await cell(page, 0).click();
  await pencil(page, 0, 2).click();
  await page.keyboard.press("Digit4");
  await cell(page, 0).click({ button: "right" });
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");
  await cell(page, 0).click({ button: "right" });
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
});

test("keyboard undo and redo return selection and highlight to the edited cell", async ({
  page,
}) => {
  await cell(page, 0).click();
  await page.keyboard.press("Digit4");
  await cell(page, 2).click();
  await page.keyboard.press("Control+z");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");
  await cell(page, 2).click();
  await page.keyboard.press("Control+Shift+z");
  await expectValue(page, 0, 4);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "4");
});

test("game shortcuts in Journal cannot change the saved game or digit lock", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("Digit4");
  await page.locator(".dbtn").click();
  await expect(page.locator(".journal")).toBeVisible();
  for (const key of ["Digit7", "Control+z", "Shift+Digit2", "Delete"]) {
    await page.keyboard.press(key);
  }
  await page.locator("#time-control").click();
  await expectValue(page, 0, 4);
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
});

for (const viewport of [
  { width: 600, height: 844 },
  { width: 719, height: 768 },
  { width: 899, height: 600 },
  { width: 900, height: 600 },
  { width: 1280, height: 600 },
]) {
  test(`desktop controls and pause fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const selector of [".board", ".tools", "#keypad"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await expect(page.locator(".notes-mode").filter({ visible: true })).toHaveCount(1);
    await expect(page.locator("[data-more]").filter({ visible: true })).toHaveCount(1);
    await page.keyboard.press("p");
    await expect(page.locator("#resume")).toBeVisible();
    await expect(page.locator("#undo")).toBeDisabled();
    await expect(page.locator("#keypad")).toHaveJSProperty("isConnected", true);
    await expect(page.locator(".chrome-dim")).toHaveAttribute("inert", "");
    await page.locator("#resume").click();
    await expect(page.locator(".chrome-dim")).not.toHaveAttribute("inert");
  });
}
