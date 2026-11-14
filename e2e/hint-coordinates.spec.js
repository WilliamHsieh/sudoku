import { test, expect } from "@playwright/test";
import { DEMO_PUZZLE, openBoard } from "./helpers.js";
import { findHint } from "../src/hints/engine.js";
import { newGame } from "../src/game/game.js";

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

const pair = "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
for (const width of [402, 1280]) {
  for (const [action, puzzle] of [
    ["placement", DEMO_PUZZLE],
    ["elimination", pair],
  ]) {
    test(`one ${action} summary keeps coordinates and Apply/Undo working at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 874 });
      await openBoard(page, `./?q=${puzzle}`);
      const hint = findHint(newGame(puzzle, { notesMode: "auto" }));
      expect(hint.stages[2].description).toEqual([hint.effect]);
      const before = await boardData(page);
      await page.locator("#hint-trigger").click();
      const panel = page.locator("#hint-panel");
      await expect(panel.locator(".hint-position")).toHaveText("1/3");
      await panel.locator('[data-action="next"]').click();
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".hint-position")).toHaveText("3/3");
      await expect(panel.locator(".hint-body > p")).toHaveCount(0);
      await expect(panel.locator(".hint-effect")).toHaveCount(1);
      await expect(panel.locator(".hint-effect")).toHaveText(hint.effect);
      await expect(panel.locator(".hint-coordinate, .hint-coordinates")).toHaveCount(0);
      const effects = [...hint.placements, ...hint.eliminations];
      await expect(panel.locator(".hint-reference")).toHaveCount(effects.length);
      const ref = panel.locator(".hint-effect .hint-reference").first();
      const target = page.locator(`.board > .cell[data-i="${effects[0].cell}"]`);
      await ref.focus();
      await page.keyboard.press("Enter");
      await expect(ref).toBeFocused();
      await expect(target).toHaveClass(/hint-focus/);
      await expect(ref).toHaveCSS("text-decoration-line", "underline");
      await page.keyboard.press("Space");
      await expect(target).toHaveClass(/hint-focus/);
      expect(await boardData(page)).toEqual(before);
      await expect(panel.locator(".hint-position")).toHaveText("3/3");
      await panel.locator('[data-action="apply"]').click();
      for (const { cell, digit } of hint.placements)
        await expect(page.locator(`.board > .cell[data-i="${cell}"]`)).toHaveAttribute(
          "data-value",
          String(digit)
        );
      for (const { cell, digit } of hint.eliminations)
        await expect(page.locator(`.board > .cell[data-i="${cell}"]`)).not.toHaveAttribute(
          "data-notes",
          new RegExp(String(digit))
        );
      await expect(panel.locator('[data-action="apply"]')).toHaveCount(0);
      await panel.locator('[data-action="undo"]').click();
      await expect(panel).toHaveCount(0);
      expect(await boardData(page)).toEqual(before);
    });
  }
}
