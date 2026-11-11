// Saved-board/replay coverage formerly reached through Journal.
import { test, expect } from "@playwright/test";
import { seed, openList, finish, resumeTarget } from "./bank-fixture.js";
import { switchNotesMode, resumeFromHome } from "./helpers.js";
for (const width of [390, 1280]) {
  test(`saved board is read-only; Replay confirmation cancels and restores focus (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 1 });
    await openList(page);
    await page.getByRole("button", { name: /第 1 題，已解/ }).click();
    await expect(page.locator(".sv-view-panel .hero")).toHaveText("8:10");
    const before = await page.locator(".board").innerText();
    await page.keyboard.press("1");
    await page.keyboard.press("Control+z");
    await expect(page.locator(".board")).toHaveText(before);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("重玩不計入解鎖進度。");
    await page.keyboard.press("Escape");
    await expect(page.locator("#sv-replay")).toBeFocused();
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
  test(`Replay keeps saved time across leave, reload and Resume (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, { count: 1 });
    await openList(page);
    await page.getByRole("button", { name: /第 1 題，已解/ }).click();
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Replay", exact: true })
      .click();
    await expect(page.locator(".sv-view-panel")).toHaveCount(0);
    const first = page.locator(".cell:not(.given)").first();
    await first.click();
    await page.keyboard.press("1");
    const id = await first.getAttribute("data-i");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("button", { name: /第 1 題，重玩中/ })).toBeVisible();
    await page.reload();
    await openList(page);
    await page.getByRole("button", { name: /第 1 題，重玩中/ }).click();
    await expect(page.locator(".hero")).toHaveText("8:10");
    await page.getByRole("button", { name: "Resume replay", exact: true }).click();
    await expect(page.locator(`.cell[data-i="${id}"]`)).toHaveAttribute("data-value", "1");
  });
  test(`completed replay removes Unfinished and retains saved original (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const data = await seed(page, { replay: true });
    await page.getByRole("button", { name: /Unfinished/ }).click();
    await page.getByRole("button", { name: /Resume/ }).click();
    await finish(page, data);
    await expect(page.locator(".unlock-overlay")).toHaveCount(0);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.locator(".bank-pages .back").click();
    await expect(page.getByRole("button", { name: /Unfinished/ })).toHaveCount(0);
    await openList(page);
    await page.getByRole("button", { name: /第 1 題，已解/ }).click();
    await expect(page.locator(".hero")).toHaveText("8:10");
  });
}

for (const width of [390, 1280])
  test(`closing and restarting a replay preserves notes, elapsed and the saved solve (${width})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const data = await resumeTarget(page, { replay: true, time: 133 });
    await switchNotesMode(page, "Manual");
    await page.keyboard.press(`Shift+Digit${data.digit}`);
    await page.locator(`.cell[data-i="${data.last}"]`).click();
    await page.keyboard.press("Escape");
    await expect(page.locator(`.cell[data-i="${data.last}"]`)).toHaveAttribute(
      "data-notes",
      String(data.digit)
    );
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await expect
      .poll(() =>
        page.evaluate(() => {
          const slots = JSON.parse(localStorage.getItem("sudoku-bank-saves-v1")).slots;
          return JSON.parse(slots.target).snapshot.notesMode;
        })
      )
      .toBe("manual");
    const url = page.url();
    await page.close();
    const reopened = await context.newPage();
    await reopened.setViewportSize({ width, height: 844 });
    await reopened.goto(url);
    await resumeFromHome(reopened);
    await expect(reopened.locator(`.cell[data-i="${data.last}"]`)).toHaveAttribute(
      "data-notes",
      String(data.digit)
    );
    await expect(reopened.locator("[data-time]").first()).toHaveText(/^2:1[3-9]$/);
    await reopened
      .getByRole("button", { name: "More", exact: true })
      .filter({ visible: true })
      .click();
    await reopened.getByRole("button", { name: "Restart puzzle", exact: true }).click();
    await reopened
      .locator("dialog.confirm")
      .getByRole("button", { name: "Restart", exact: true })
      .click();
    await expect(reopened.locator(".board .cell.user")).toHaveCount(0);
    await expect(reopened.locator(`.cell[data-i="${data.last}"]`)).toHaveAttribute(
      "data-notes",
      ""
    );
    await expect(reopened.locator("[data-time]").first()).toHaveText(/^0:0[0-2]$/);
    await reopened.getByRole("button", { name: "Back", exact: true }).click();
    await reopened.locator(".bank-pages .back").click();
    await openList(reopened);
    await reopened.getByRole("button", { name: /第 1 題，重玩中/ }).click();
    await expect(reopened.locator(".hero")).toHaveText("8:10");
  });
