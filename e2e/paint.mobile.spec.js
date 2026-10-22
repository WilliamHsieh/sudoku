import { test, expect } from "@playwright/test";
import { paintCases, paintSetup } from "./paint-cases.js";
import { cell, pencil } from "./helpers.js";
paintCases(true);

for (const keyFirst of [true, false]) {
  test(`HOLD paints with a fixed brush and commits on key release (${keyFirst ? "key" : "board"} first)`, async ({
    page,
  }) => {
    const t = await paintSetup(page, true);
    const key = page.locator('.key[data-d="5"]');
    const k = { ...(await t.center(key)), id: 1 };
    const a = { ...(await t.center(cell(page, 37))), id: 2 };
    const b = { ...(await t.center(cell(page, 42))), id: 2 };
    await t.contacts("touchStart", [k]);
    await page.waitForTimeout(300);
    await t.contacts("touchStart", [k, a]);
    await t.contacts("touchMove", [k, b]);
    for (const i of [37, 38, 41, 42]) await expect(pencil(page, i, 5)).toHaveClass(/paint-blue/);
    await expect(page.locator("#undo")).toBeDisabled();
    // Key drift must not become a lock or a swipe-up edit after paint begins.
    const drift = { ...k, y: k.y + 45 };
    await t.contacts("touchMove", [drift, b]);
    await expect(key).not.toHaveClass(/arm-lock/);
    if (keyFirst) {
      await t.contacts("touchEnd", [drift]);
      await expect(page.locator("#undo")).toBeEnabled();
      const c = { ...(await t.center(cell(page, 43))), id: 2 };
      await t.contacts("touchMove", [c]);
      await expect(cell(page, 43)).toHaveAttribute("data-notes", "");
      await t.contacts("touchEnd", []);
    } else {
      await t.contacts("touchEnd", [b]);
      await expect(page.locator("#undo")).toBeDisabled();
      // A new board contact belongs to the same stroke and keeps its brush.
      await t.contacts("touchStart", [drift, a]);
      await expect(cell(page, 37)).toHaveAttribute("data-notes", "5");
      await t.contacts("touchEnd", [a]);
      await t.contacts("touchEnd", []);
    }
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
    await expect(page.locator(".sr-only[aria-live]")).toHaveText(
      "Added 5 to 4 cells; 1 cell refused"
    );
    await page.locator("#undo").click();
    for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
    await expect(page.locator("#undo")).toBeDisabled();
  });
}

test("LOCK ignores an extra board finger; cancellation restores every painted cell", async ({
  page,
}) => {
  const t = await paintSetup(page, true);
  await t.lock();
  const a = { ...(await t.center(cell(page, 37))), id: 1 };
  const b = { ...(await t.center(cell(page, 43))), id: 2 };
  await t.contacts("touchStart", [a]);
  await t.contacts("touchStart", [a, b]);
  await expect(cell(page, 43)).toHaveAttribute("data-notes", "");
  await t.cancel();
  await expect(cell(page, 37)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeDisabled();
});

test("HOLD cancellation restores its draft and an illegal first cell flashes without toast", async ({
  page,
}) => {
  const t = await paintSetup(page, true);
  const k = { ...(await t.center(page.locator('.key[data-d="5"]'))), id: 1 };
  const a = { ...(await t.center(cell(page, 37))), id: 2 };
  const b = { ...(await t.center(cell(page, 42))), id: 2 };
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  await t.contacts("touchStart", [k, a]);
  await t.contacts("touchMove", [k, b]);
  await expect(cell(page, 38)).toHaveAttribute("data-notes", "5");
  await t.cancel();
  for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator(".sr-only[aria-live]")).toHaveText("");
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  const refused = { ...(await t.center(cell(page, 40))), id: 2 };
  await t.contacts("touchStart", [k, refused]);
  await expect(cell(page, 4)).toHaveClass(/blocked/);
  await expect(page.locator(".toast")).toHaveCount(0);
  await t.contacts("touchMove", [k, b]);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "");
  await t.contacts("touchEnd", []);
  await expect(page.locator("#undo")).toBeDisabled();
});

test("HOLD blue chip shows even when another digit remains locked", async ({ page }) => {
  const t = await paintSetup(page, true);
  await t.lock(6);
  const k = { ...(await t.center(page.locator('.key[data-d="5"]'))), id: 1 };
  const a = { ...(await t.center(cell(page, 37))), id: 2 };
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  await t.contacts("touchStart", [k, a]);
  await expect(pencil(page, 37, 5)).toHaveClass(/paint-blue/);
  await expect(pencil(page, 37, 5)).not.toHaveClass(/matching-number/);
  await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
  await t.contacts("touchEnd", []);
  await expect(pencil(page, 37, 5)).not.toHaveClass(/paint-added/);
  await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
