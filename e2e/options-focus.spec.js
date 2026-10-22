import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    test.describe(`Options focus at ${viewport.width}x${viewport.height}, ${reducedMotion}`, () => {
      test.use({ viewport, reducedMotion });

      for (const action of ["mouse Cancel", "Esc", "Enter on Cancel"]) {
        test(`${action} returns to Restart, then Done returns to More`, async ({ page }) => {
          await openBoard(page, "./?shot=1&freeze");
          const more = page.locator("[data-more]").filter({ visible: true });
          await more.click();
          await expect(page.locator("#opt-cue")).toBeFocused();
          await page.locator("#opt-restart").click();
          await expect(page.locator("#confirm-cancel")).toBeFocused();

          if (action === "mouse Cancel") await page.locator("#confirm-cancel").click();
          else await page.keyboard.press(action === "Esc" ? "Escape" : "Enter");

          await expect(page.locator("dialog.confirm")).toBeHidden();
          await expect(page.locator("dialog.opts")).toBeVisible();
          await expect.soft(page.locator("#opt-restart")).toBeFocused();

          await page.locator("#opts-done").click();
          await expect(page.locator("dialog.opts")).toBeHidden();
          await expect.soft(more).toBeFocused();
        });
      }
    });
  }
}
