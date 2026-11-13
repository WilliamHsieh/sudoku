import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

const puzzle = "034678912672195348198342567859761423426853791713924856961537284287419635345286179";
const boardData = (page) =>
  page
    .locator(".board > .cell")
    .evaluateAll((cells) =>
      cells.map((cell) => [cell.getAttribute("data-value"), cell.getAttribute("data-notes")])
    );

for (const width of [402, 1280]) {
  test(`hint coordinates remain reachable without colored chips at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    await openBoard(page, `./?q=${puzzle}`);
    const before = await boardData(page);
    await page.locator("#hint-trigger").click();
    const panel = page.locator("#hint-panel");
    await expect(panel.locator(".hint-position")).toHaveText("1/3");
    for (let stage = 0; stage < 3; stage++) {
      await expect(panel.locator(".hint-coordinate, .hint-coordinates")).toHaveCount(0);
      const cells = stage < 2 ? Array.from({ length: 9 }, (_, i) => i) : [0];
      for (const cell of cells) {
        const ref = panel.locator(`.hint-reference[data-cell="${cell}"]`).first();
        await expect(ref).toHaveAccessibleName(
          `在棋盤上查看 r1c${cell + 1}（第 1 橫列、第 ${cell + 1} 直行）`
        );
        await expect(ref).toHaveCSS("text-decoration-line", "underline");
        await ref.click();
        await expect(page.locator(".board .hint-focus")).toHaveCount(1);
        await expect(page.locator(`.board > .cell[data-i="${cell}"]`)).toHaveClass(/hint-focus/);
        await expect(panel.locator(".hint-position")).toHaveText(`${stage + 1}/3`);
      }
      if (stage < 2) {
        // Filled-cell premises were previously available only through colored chips.
        const ref = panel.locator('.hint-reference[data-cell="1"]');
        await expect(ref).toHaveCount(1);
        await ref.focus();
        await page.keyboard.press(stage === 0 ? "Enter" : "Space");
        await expect(ref).toBeFocused();
        await expect(page.locator('.board > .cell[data-i="1"]')).toHaveClass(/hint-focus/);
        expect(await boardData(page)).toEqual(before);
        await panel.getByRole("button", { name: "下一個提示", exact: true }).click();
        await expect(panel.locator(".hint-position")).toHaveText(`${stage + 2}/3`);
        await expect(page.locator(".board .hint-focus")).toHaveCount(0);
      }
    }
    await expect(panel.locator('[data-action="apply"]')).toBeVisible();
    await panel.getByRole("button", { name: "上一個提示", exact: true }).click();
    await expect(panel.locator(".hint-position")).toHaveText("2/3");
    await panel.getByRole("button", { name: "收起提示" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".board .hint-focus")).toHaveCount(0);
    expect(await boardData(page)).toEqual(before);
  });
}
