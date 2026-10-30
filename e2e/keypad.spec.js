import { switchNotesMode } from "./helpers.js";
// Desktop keyboard side of the shared keypad: Shift+digit, Space and Escape
// drive the same lock as the pointer controls.
import { test, expect } from "@playwright/test";
import { touchDriver } from "./touch.js";
import {
  cell,
  openBoard,
  expectValue,
  expectShiftAgreement,
  moveToPencil,
  pencil,
} from "./helpers.js";

test("Shift+digit locks, keeps the selection, and does not stick shift-hover", async ({ page }) => {
  await openBoard(page);
  await cell(page, 0).evaluate((el) => {
    el.tabIndex = 0;
    el.focus();
  });
  await cell(page, 0).click();
  await moveToPencil(page, 0, 2);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  await page.keyboard.press("Digit5");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
  await expect(page.locator('.key[data-d="5"]')).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expectShiftAgreement(page, null);
  await expect(cell(page, 0)).toBeFocused();
  await page.keyboard.up("Shift");

  await page.keyboard.press("Escape");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "5");
  await expect(cell(page, 0)).toHaveClass(/selected/);

  await cell(page, 0).click();
  await moveToPencil(page, 0, 2);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 2 });
  await page.keyboard.up("Shift");

  await page.keyboard.press("Digit4");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Shift+Digit2");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await expect(cell(page, 0)).toHaveClass(/selected/);

  await page.locator("#undo").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await expectValue(page, 0, 0);
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`keyboard lock at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: viewport.width === 390, isMobile: viewport.width === 390 });

    test(`arrows and Space preserve selection; Enter ${viewport.width < 600 ? "keeps the phone note toggle" : "fills the desktop answer"}`, async ({
      page,
    }) => {
      await openBoard(page);
      await cell(page, 58).click();
      await expectValue(page, 58, 0);
      await expectValue(page, 59, 0);
      await page.keyboard.press("Shift+Digit5");
      await expect(cell(page, 58)).toHaveClass(/selected/);
      await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");

      await page.keyboard.press("ArrowRight");
      await expect(cell(page, 59)).toHaveClass(/selected/);
      await expect(cell(page, 59)).toHaveAttribute("data-notes", "2568");
      await page.keyboard.press("Space");
      await expect(cell(page, 59)).toHaveAttribute("data-notes", "268");
      await expect(cell(page, 59)).toHaveClass(/selected/);
      await page.keyboard.press("Enter");
      if (viewport.width < 600) {
        await expect(cell(page, 59)).toHaveAttribute("data-notes", "2568");
        await expectValue(page, 59, 0);
      } else {
        await expectValue(page, 59, 5);
        await page.keyboard.press("Enter");
        await expectValue(page, 59, 5);
      }
      await expect(cell(page, 59)).toHaveClass(/selected/);

      await page.keyboard.press("ArrowLeft");
      const notes = await cell(page, 58).getAttribute("data-notes");
      await page.keyboard.press("Space");
      await expect(cell(page, 58)).toHaveAttribute("data-notes", notes.replace("5", ""));
      await expect(cell(page, 58)).toHaveClass(/selected/);
      await page.keyboard.press("Enter");
      if (viewport.width < 600) {
        await expect(cell(page, 58)).toHaveAttribute("data-notes", notes);
        await expectValue(page, 58, 0);
      } else await expectValue(page, 58, 5);
      await expect(cell(page, 58)).toHaveClass(/selected/);
      await expect(page.locator(".cell.selected")).toHaveCount(1);
      await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
    });
  });
}

test("arrows and digit keys keep the keypad and the board on the same digit", async ({ page }) => {
  await openBoard(page);
  await cell(page, 21).click();
  await expect(cell(page, 21)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "2");
  await expect(cell(page, 37)).toHaveClass(/same/);
  await expect(page.locator('.key.shown[data-d="2"]')).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 22)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "8");
  await expect(cell(page, 37)).not.toHaveClass(/same/);
  await expect(cell(page, 9)).toHaveClass(/same/);
  await expect(page.locator('.key.shown[data-d="8"]')).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 23)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "8");
  await expect(cell(page, 9)).toHaveClass(/same/);

  await cell(page, 0).click();
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "8");
  await page.keyboard.press("Digit4");
  await expectValue(page, 0, 4);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "4");
  await expect(cell(page, 13)).toHaveClass(/same/);
  await expect(page.locator(".cell.same")).toHaveCount(6);
  await expect(page.locator('.key.shown[data-d="4"]')).toHaveCount(1);

  await page.keyboard.press("Digit0");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "0");
  await expect(page.locator(".cell.same")).toHaveCount(0);
  await expect(page.locator(".pencil-box.matching-number")).toHaveCount(0);
  await expect(page.locator(".key.shown")).toHaveCount(0);

  await pencil(page, 0, 3).click({ modifiers: ["Shift"] });
  await expectValue(page, 0, 3);
  await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "3");
  await expect(cell(page, 15)).toHaveClass(/same/);
});

test("a click on a pencil while locked toggles only the locked digit", async ({ page }) => {
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1_000);
  await openBoard(page);
  await cell(page, 0).click();
  await page.keyboard.press("Shift+Digit5");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
  await expect(cell(page, 0)).toHaveClass(/selected/);

  await pencil(page, 0, 2).click();
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(cell(page, 1)).toHaveClass(/blocked/);
  await expect(cell(page, 0)).not.toHaveClass(/blocked/);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
  await expect(page.locator(".toast")).toHaveText("Can't place 5 — already in row, column or box");
  await expect(page.locator("#undo")).toBeDisabled();
});

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

  await expect(cell(page, 0)).toHaveClass(/selected/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
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
  await expectValue(page, 0, 7); // Keyboard LOCK keeps the selected cell.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Digit7");
  await expectValue(page, 0, 7);
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");

  await page.locator("#undo").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "2");
  await expectValue(page, 0, 4);
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

    await page.locator(".dbtn").click();
    const day = page.locator('.dgrid .day[data-d="2026-10-15"]');
    await day.click();
    await expect(page.locator(".dgrid .day.sel")).toHaveAttribute("data-d", "2026-10-15");
    if (!selected) await day.click();
    await expect(day).toHaveAttribute("aria-pressed", String(selected));
    if (!selected) await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");
    await page.keyboard.press("Escape");
    await expect(day).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".ctx .kicker")).toHaveText("Latest puzzles");

    await page.locator("#time-control").click();
    await expect(pad).toHaveAttribute("data-locked", "5");
    await expect(five).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(pad).toHaveAttribute("data-locked", "0");
    await expect(five).toHaveAttribute("aria-pressed", "false");
    await expect(pad).toHaveAttribute("data-shown", "5");
  });
}

for (const target of ["board", "keypad"]) {
  test(`390px: ${target} input releases header focus before keyboard lock`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page);
    const play = page.locator("#time-control");
    await play.focus();
    await expect(play).toBeFocused();
    if (target === "board") {
      await cell(page, 58).dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 90 });
    } else {
      await cell(page, 58).click();
      await play.focus();
      await page.locator('.key[data-d="5"]').dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 91,
        clientX: 0,
        clientY: 0,
      });
      await page.locator('.key[data-d="5"]').dispatchEvent("pointercancel", { pointerId: 91 });
    }
    await expect(play).not.toBeFocused();
    await page.keyboard.press("Shift+Digit5");
    await expect(cell(page, 58)).toHaveClass(/selected/);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(cell(page, 59)).toHaveAttribute("data-notes", "268");
    await expect(cell(page, 59)).toHaveClass(/selected/);
    await expect(page.locator(".board")).toBeVisible();
  });
}

test.describe("touch double-tap on a wide board", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  for (const focused of [false, true]) {
    test(`lone candidate fills with ${focused ? "another digit" : "nothing"} focused`, async ({
      page,
    }) => {
      await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
      await page.clock.pauseAt(new Date("2026-10-23T12:00:01Z"));
      await openBoard(page);
      if (focused) await cell(page, 15).click();
      await expect(cell(page, 49)).toHaveAttribute("data-notes", "5");
      const t = await touchDriver(page);
      await t.doubleTap(cell(page, 49));
      await expectValue(page, 49, 5);
      await expect(page.locator("#keypad")).toHaveAttribute("data-shown", "5");
      await expect(cell(page, 49)).toHaveClass(/selected/);
      await expect(page.locator('.cell.same:not([data-value="5"])')).toHaveCount(0);
    });
  }
});

test.describe("Manual board double-tap on a wide touch board", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  for (const notes of ["", "5", "57"]) {
    for (const focused of [0, 3, 5]) {
      test(`notes ${notes || "none"}, focus ${focused}`, async ({ page }) => {
        await page.clock.install({ time: new Date("2026-10-23T12:00:00Z") });
        await page.clock.pauseAt(new Date("2026-10-23T12:00:01Z"));
        await openBoard(page);
        await switchNotesMode(page);
        await cell(page, 42).click();
        for (const d of notes) {
          await page.keyboard.press(`Shift+Digit${d}`);
          await page.keyboard.press("Space");
          await page.keyboard.press("Escape");
        }
        // Set keypad focus in the compact layout, then keep it on resize.
        const t = await touchDriver(page);
        await page.setViewportSize({ width: 390, height: 844 });
        const pad = page.locator("#keypad");
        const shown = Number(await pad.getAttribute("data-shown"));
        if (focused !== shown) {
          await t.tap(page.locator(`.key[data-d="${focused || shown}"]`));
          await page.clock.runFor(301);
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await expect(pad).toHaveAttribute("data-shown", String(focused));
        await expect(cell(page, 42)).toHaveAttribute("data-notes", notes);
        await t.doubleTap(cell(page, 42));
        await expectValue(page, 42, focused);
        await expect(cell(page, 42)).toHaveClass(/selected/);
        await expect(page.locator("#keypad")).toHaveAttribute("data-shown", String(focused));
        if (focused) {
          await expect(cell(page, 42)).toHaveClass(/same/);
          await expect(page.locator(`.cell.same:not([data-value="${focused}"])`)).toHaveCount(0);
          await page.keyboard.press("Control+z");
          await expectValue(page, 42, 0);
        }
        await expect(cell(page, 42)).toHaveAttribute("data-notes", notes);
      });
    }
  }
});
