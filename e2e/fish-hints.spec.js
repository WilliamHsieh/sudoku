import { test, expect } from "@playwright/test";
import { openFishCase } from "./fish-cases.js";
import { pencil } from "./helpers.js";

for (const mobile of [true, false]) {
  test.describe(mobile ? "402px phone" : "desktop", () => {
    test.use({
      viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 900 },
      deviceScaleFactor: mobile ? 3 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    test("finned fish explains both cases and preserves navigation, apply and undo", async ({
      page,
    }) => {
      await openFishCase(page);
      const panel = page.locator("#hint-panel");
      const notes = () =>
        page
          .locator(".board > .cell")
          .evaluateAll((cells) => cells.map((c) => c.getAttribute("data-notes")));
      const before = await notes();
      const board = await page.locator(".board").boundingBox();
      await expect(panel.locator(".hint-body")).not.toContainText(/若|必須|刪除/);
      await panel.getByRole("button", { name: "下一個提示", exact: true }).click();
      await expect(panel.locator(".hint-position")).toHaveText("2/3");
      await expect(panel.locator(".technique")).toHaveText("Finned X-Wing");
      const paragraphs = panel.locator(".hint-body > p");
      await expect(paragraphs).toHaveCount(5);
      await expect(paragraphs.nth(1)).toContainText("若 r1c8 中有一格填入 7");
      await expect(paragraphs.nth(2)).toContainText("若 r1c8 全都不是 7");
      await expect(paragraphs.nth(2)).toContainText("第 1、4 橫列都還沒填入 7");
      await expect(paragraphs.nth(2)).toContainText("每個橫列都必須有一個 7");
      await expect(paragraphs.nth(3)).toContainText("同一直行不能有兩個 7");
      await expect(paragraphs.nth(4)).toContainText("r2c7、r3c7 都不能是 7");
      await expect(panel.locator(".hint-body")).not.toContainText(/來源線|覆蓋線/);
      for (const paragraph of await paragraphs.all()) {
        await paragraph.scrollIntoViewIfNeeded();
        await expect(paragraph).toBeInViewport();
      }
      await expect(panel.locator('[data-action="next"]')).toBeInViewport();
      expect(await page.locator(".board").boundingBox()).toEqual(board);
      expect(await notes()).toEqual(before);
      // Coordinate buttons and the #108 header navigation remain usable even
      // after a long proof has been scrolled to the last paragraph.
      const target = paragraphs
        .last()
        .getByRole("button", { name: "在棋盤上查看 r2c7（第 2 橫列、第 7 直行）", exact: true });
      await target.click();
      await expect(page.locator('.board > .cell[data-i="15"]')).toHaveClass(/hint-focus/);
      await expect(panel.locator(".hint-position")).toHaveText("2/3");
      await panel.getByRole("button", { name: "上一個提示", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(panel.locator(".hint-position")).toHaveText("1/3");
      await panel.getByRole("button", { name: "下一個提示", exact: true }).click();
      await expect(panel.locator(".hint-body")).toHaveJSProperty("scrollTop", 0);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".hint-position")).toHaveText("3/3");
      await expect(panel.locator(".hint-effect")).toHaveText("r2c7 刪除 7；r3c7 刪除 7");
      await panel.locator('[data-action="apply"]').click();
      await expect(panel).toContainText("已刪除 2 個候選數");
      for (const cell of [15, 24]) await expect(pencil(page, cell, 7)).toHaveClass(/invisible/);
      await panel.locator('[data-action="undo"]').click();
      await expect(panel).toHaveCount(0);
      expect(await notes()).toEqual(before);
    });
  });
}
