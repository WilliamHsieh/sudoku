import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

const modeControl = (page) =>
  page.getByRole("button", { name: /^Notes mode:/ }).filter({ visible: true });
async function chooseMode(page, mode) {
  await modeControl(page).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${mode} `) }).click();
  await expect(modeControl(page)).toHaveAccessibleName(`Notes mode: ${mode}`);
  await expect(modeControl(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
}
async function visibleNotes(page) {
  return page.locator(".board > .cell").evaluateAll((cells) =>
    cells.map((cell) => ({
      notes: cell.getAttribute("data-notes"),
      visible: [...cell.querySelectorAll(".pencil-box:not(.invisible)")].map((el) =>
        el.textContent.trim()
      ),
    }))
  );
}

for (const width of [390, 1280]) {
  test(`Manual hides hints and Tidy preserves blank notes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openBoard(page);
    await chooseMode(page, "Manual");
    await expect(page.locator("#hint-trigger")).toHaveCount(0);
    await chooseMode(page, "Tidy");
    await expect(page.locator("#hint-trigger")).toBeVisible();
    const before = await visibleNotes(page);
    expect(before.every((cell) => cell.visible.length === 0)).toBe(true);
    await page.locator("#hint-trigger").click();
    const panel = page.locator("#hint-panel");
    await expect(panel.locator('[data-action="next"]')).toBeVisible();
    for (let stage = 0; stage < 3; stage++) {
      expect(await visibleNotes(page)).toEqual(before);
      if (stage < 2) await panel.locator('[data-action="next"]').click();
    }
    await panel.getByRole("button", { name: "收起提示" }).click();
    expect(await visibleNotes(page)).toEqual(before);
    await expect(page.locator(".mobile-chrome")).not.toHaveAttribute("inert");
  });
}

test("changing to Manual while a hint is open clears the panel and restores controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await openBoard(page);
  await page.locator("#hint-trigger").click();
  await expect(page.locator("#hint-panel")).toBeVisible();
  await chooseMode(page, "Manual");
  await expect(page.locator("#hint-trigger")).toHaveCount(0);
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await expect(page.locator(".mobile-chrome")).not.toHaveAttribute("inert");
  await expect(page.locator(".hint-observe, .hint-premise, .hint-target")).toHaveCount(0);
  await chooseMode(page, "Auto");
  await page.locator("#hint-trigger").click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
});

test("real Auto Worker applies a visible elimination without repeating it and supports undo", async ({
  page,
}) => {
  const puzzle =
    "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
  await openBoard(page, `./?q=${puzzle}`);
  await chooseMode(page, "Auto");
  const target = page.locator('.board > .cell[data-i="77"]');
  const five = target.locator('.pencil-box[data-d="5"]');
  await expect(five).not.toHaveClass(/invisible/);
  const [worker] = await Promise.all([
    page.waitForEvent("worker"),
    page.locator("#hint-trigger").click(),
  ]);
  expect(worker.url()).toMatch(/engine\.worker/);
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await panel.locator('[data-action="next"]').click();
  await expect(panel.locator(".technique")).toHaveText("顯性數對");
  await panel.locator('[data-action="next"]').click();
  await expect(panel.locator(".hint-effect")).toContainText("r9c6 刪除 5");
  await panel.locator('[data-action="apply"]').click();
  await expect(five).toHaveClass(/invisible/);
  await expect(panel).toContainText("已刪除 1 個候選數");
  await panel.locator('[data-action="undo"]').click();
  await expect(panel).toHaveCount(0);
  await expect(five).not.toHaveClass(/invisible/);

  // Undo deliberately restores the effective hint. After applying again, a new
  // Worker must continue from the changed Auto candidates, not repeat it.
  await page.locator("#hint-trigger").click();
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await panel.locator('[data-action="next"]').click();
  await panel.locator('[data-action="next"]').click();
  await panel.locator('[data-action="apply"]').click();
  await panel.getByRole("button", { name: "收起提示" }).click();
  await page.locator("#hint-trigger").click();
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await panel.locator('[data-action="next"]').click();
  await expect(panel.locator(".technique")).toHaveText("XY-Wing");
  await panel.locator('[data-action="next"]').click();
  await expect(five).not.toHaveClass(/hint-elimination/);
  await expect(five).toHaveClass(/invisible/);
});
