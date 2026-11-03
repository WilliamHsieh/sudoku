import { test, expect } from "@playwright/test";
import { cell } from "./helpers.js";
import { paintSetup, freezeTimers } from "./paint-cases.js";

test("Space holds a shown digit across clicks and drags, committing one undo on release", async ({
  page,
}) => {
  const t = await paintSetup(page, false);
  await cell(page, 73).click();
  await page.locator('.key[data-d="5"]').click();
  await freezeTimers(page);
  await page.keyboard.down("Space");
  await page.clock.runFor(250);
  await expect(page.locator('.key[data-d="5"]')).toHaveClass(/holding/);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(cell(page, 73)).toHaveAttribute("data-notes", "");
  await t.down(37);
  await t.to(38);
  await t.up();
  await t.down(41);
  await t.to(42);
  await t.to(41);
  await t.up();
  for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "5");
  await expect(page.locator("#undo")).toBeDisabled();
  await page.keyboard.down("Space"); // OS repeat must not toggle or commit.
  await expect(page.locator("#undo")).toBeDisabled();
  await page.keyboard.up("Space");
  await expect(page.locator("#keypad")).toHaveAttribute("data-held", "0");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "5");
  await expect(page.locator(".play .sr-only[aria-live]")).toHaveText("Added 5 to 4 cells");
  await page.keyboard.press("Control+z");
  for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeDisabled();
});

test("Space can paint immediately and release before the mouse button", async ({ page }) => {
  const t = await paintSetup(page, false);
  await page.locator('.key[data-d="5"]').click();
  await page.keyboard.down("Space");
  await t.down(37);
  await t.to(38);
  await page.keyboard.up("Space");
  await t.to(41);
  await t.up();
  for (const i of [37, 38]) await expect(cell(page, i)).toHaveAttribute("data-notes", "5");
  await expect(cell(page, 41)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeEnabled();
});

for (const interruption of ["Escape", "blur", "hidden", "pause", "options"]) {
  test(`${interruption} cancels Space painting without committing or leaving a held digit`, async ({
    page,
  }) => {
    const t = await paintSetup(page, false);
    await cell(page, 73).click();
    await t.lock();
    await page.keyboard.down("Space");
    await t.down(37);
    await t.to(38);
    await t.up();
    await expect(page.locator("#keypad")).toHaveAttribute("data-held", "5");
    if (interruption === "Escape") await page.keyboard.press("Escape");
    else if (interruption === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else if (interruption === "hidden")
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
    else if (interruption === "pause") await page.keyboard.press("p");
    else
      await page
        .locator("[data-more]")
        .last()
        .evaluate((el) => el.click());
    await page.keyboard.up("Space");
    for (const i of [37, 38]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
    await expect(page.locator("#keypad")).toHaveAttribute("data-held", "0");
    await expect(page.locator("#undo")).toBeDisabled();
    if (interruption === "Escape")
      await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
  });
}
