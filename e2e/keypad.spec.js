// Desktop keyboard side of keypad r2. The pad itself is off-screen; Shift+digit,
// Space and Escape still drive the lock.
import { test, expect } from "@playwright/test";
import {
  cell,
  openBoard,
  expectValue,
  expectShiftAgreement,
  moveToPencil,
  pencil,
} from "./helpers.js";

test("Shift+digit locks without sticking shift-hover; Space toggles; digits still fill", async ({
  page,
}) => {
  await openBoard(page);
  await cell(page, 0).click();
  await moveToPencil(page, 0, 2);
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

test("a click on a pencil while locked toggles only the locked digit", async ({ page }) => {
  await openBoard(page);
  await cell(page, 0).click();
  await page.keyboard.press("Shift+Digit5");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");

  await pencil(page, 0, 2).click();
  await expect(cell(page, 1)).toHaveClass(/blocked/);
  await expect(cell(page, 0)).not.toHaveClass(/blocked/);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await expect(page.locator(".toast")).toHaveText("Can't place 5 — already in row, column or box");
  await expect(page.locator("#undo")).toBeDisabled();
});

for (const selected of [true, false]) {
  test(`Escape in Journal ${selected ? "deselects a day" : "with no day selected"} keeps the Play digit lock`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-18T12:00:00") });
    await openBoard(page);
    await page.keyboard.press("Shift+Digit5");
    const pad = page.locator("#keypad");
    const five = page.locator('.key[data-d="5"]');
    await expect(pad).toHaveAttribute("data-locked", "5");
    await expect(five).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Journal", exact: true }).click();
    const day = page.locator('.dgrid .day[data-d="2026-10-15"]');
    await day.click();
    await expect(page.locator(".dgrid .day.sel")).toHaveAttribute("data-d", "2026-10-15");
    if (!selected) await day.click();
    await expect(day).toHaveAttribute("aria-pressed", String(selected));
    if (!selected) await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");
    await page.keyboard.press("Escape");
    await expect(day).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(pad).toHaveAttribute("data-locked", "5");
    await expect(five).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(pad).toHaveAttribute("data-locked", "0");
    await expect(five).toHaveAttribute("aria-pressed", "false");
    await expect(pad).toHaveAttribute("data-shown", "5");
  });
}
