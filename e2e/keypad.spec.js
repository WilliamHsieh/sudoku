// Desktop keyboard side of keypad r2. The pad itself is off-screen; Shift+digit,
// Space and Escape still drive the lock.
import { test, expect } from "@playwright/test";
import { cell, openBoard, expectValue, expectShiftAgreement } from "./helpers.js";

test("Shift+digit locks without sticking shift-hover; Space toggles; digits still fill", async ({
  page,
}) => {
  await openBoard(page);
  await cell(page, 0).click();
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  await page.keyboard.press("Digit5");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
  await expect(page.locator('.key[data-d="5"]')).toHaveAttribute("aria-pressed", "true");
  await expectShiftAgreement(page, null);
  await page.keyboard.up("Shift");

  await page.keyboard.press("Space");
  await expect(page.locator(".toast")).toHaveText("Can't place 5 — already in row, column or box");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");

  await page.keyboard.press("Escape");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "5");

  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 2 });
  await page.keyboard.up("Shift");

  await page.keyboard.press("Digit4");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Shift+Digit2");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await page.keyboard.press("Digit7");
  await expectValue(page, 0, 7);
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");

  await page.locator("#undo").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await expectValue(page, 0, 7);
});
