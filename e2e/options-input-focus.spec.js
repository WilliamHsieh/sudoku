import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

async function tabTo(page, target) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

async function expectRing(control) {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-width", "2px");
}

async function expectNoRing(page) {
  for (const control of await page.locator("dialog.opts button").all()) {
    await expect(control).toHaveCSS("outline-style", "none");
  }
}

async function tabAcrossBoundary(page, key) {
  await page.keyboard.press(key);
  // Native Tab can visit browser chrome and, in WebKit, the dialog itself
  // before wrapping. Never skip a background control or another button.
  for (let i = 0; i < 2; i++) {
    const nativeStop = await page.evaluate(
      () =>
        document.activeElement === document.body ||
        document.activeElement === document.querySelector("dialog.opts")
    );
    if (!nativeStop) break;
    await page.keyboard.press(key);
  }
}

for (const width of [390, 1280]) {
  for (const manual of [false, true]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      test.describe(`Options input focus: ${width}px, ${manual ? "disabled" : "enabled"} cue, ${reducedMotion}`, () => {
        test.use({
          viewport: { width, height: 844 },
          hasTouch: true,
          isMobile: width === 390,
          reducedMotion,
        });

        test.beforeEach(async ({ page }) => {
          // Change notes through the real mobile control, also for desktop cases.
          await page.setViewportSize({ width: 390, height: 844 });
          await openBoard(page, "./?shot=1&freeze");
          if (manual) await page.locator("#notes-mode").tap();
          await page.setViewportSize({ width, height: 844 });
        });

        test("pointer opening has no ring; keyboard takes over; touch reopening resets it", async ({
          page,
        }) => {
          const more = page.locator("[data-more]").filter({ visible: true });
          const first = page.locator(manual ? "#opt-tap-fill" : "#opt-cue");
          const next = page.locator(manual ? "#opt-restart" : "#opt-tap-fill");
          const activate = (control) => (width === 390 ? control.tap() : control.click());

          await activate(more);
          await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeVisible();
          if (manual) await expect(page.locator("#opt-cue")).toBeDisabled();
          else await expect(page.locator("#opt-cue")).toBeEnabled();
          await expect(first).toBeFocused();
          await expectNoRing(page);

          // Focus is retained, so keyboard input must work even before Tab.
          const checked = await first.getAttribute("aria-checked");
          await page.keyboard.press("Space");
          await expect(first).toHaveAttribute(
            "aria-checked",
            checked === "true" ? "false" : "true"
          );
          await expectRing(first);
          await page.keyboard.press("Tab");
          await expectRing(next);

          // Native modality must keep background controls out of the focus order.
          await more.evaluate((el) => el.focus());
          await expect(next).toBeFocused();
          await tabTo(page, page.locator("#opts-done"));
          await tabAcrossBoundary(page, "Tab");
          await expectRing(first);
          await tabAcrossBoundary(page, "Shift+Tab");
          await expectRing(page.locator("#opts-done"));

          await page.keyboard.press("Escape");
          await expect(page.locator("dialog.opts")).toBeHidden();
          await expect(more).toBeFocused();
          await activate(more);
          await expect(first).toBeFocused();
          await expectNoRing(page);
          await activate(page.locator("#opts-done"));
          await expect(page.locator("dialog.opts")).toBeHidden();
          await expect(more).toBeFocused();
          await activate(more);
          await expect(first).toBeFocused();
          await expectNoRing(page);
        });

        test("keyboard opening and reopening keep visible focus and switch operation", async ({
          page,
        }) => {
          const more = page.locator("[data-more]").filter({ visible: true });
          const first = page.locator(manual ? "#opt-tap-fill" : "#opt-cue");
          // Start navigation at the visible header after the mobile setup and
          // resize, rather than at a notes control that desktop has hidden.
          await page.locator("h1").filter({ visible: true }).click();
          await tabTo(page, more);
          await page.keyboard.press("Enter");
          await expectRing(first);
          const checked = await first.getAttribute("aria-checked");
          await page.keyboard.press("Space");
          await expect(first).toHaveAttribute(
            "aria-checked",
            checked === "true" ? "false" : "true"
          );
          await expectRing(first);
          await page.keyboard.press("Escape");
          await expect(page.locator("dialog.opts")).toBeHidden();
          await expect(more).toBeFocused();
          await page.keyboard.press("Space");
          await expectRing(first);
          await tabTo(page, page.locator("#opts-done"));
          await expectRing(page.locator("#opts-done"));
          await page.keyboard.press("Enter");
          await expect(page.locator("dialog.opts")).toBeHidden();
          await expect(more).toBeFocused();
        });
      });
    }
  }
}
