import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

async function conclude(page) {
  await page.locator("#hint-trigger").click();
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await panel.locator('[data-action="next"]').click();
  await panel.locator('[data-action="next"]').click();
  await expect(panel.locator(".hint-position")).toHaveText("3/3");
  return panel;
}

for (const colorScheme of ["dark", "light"]) {
  for (const width of [390, 1280]) {
    test(`placement uses green and elimination stays red in ${colorScheme} at ${width}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 844 });
      await openBoard(page);
      const before = await page
        .locator(".board > .cell")
        .evaluateAll((cells) => cells.map((el) => [el.dataset.value, el.dataset.notes]));
      let panel = await conclude(page);
      const target = page.locator(".board > .cell.hint-target");
      await expect(target).toHaveCount(1);
      const targetIndex = await target.getAttribute("data-i");
      await expect(panel.locator(".hint-effect-placement")).toContainText("填入");
      expect(
        await target.evaluate((el) => ({
          shadow: getComputedStyle(el).boxShadow,
          green: getComputedStyle(el).getPropertyValue("--cue-ink").trim(),
        }))
      ).toEqual({
        shadow: `rgb(${colorScheme === "dark" ? "155, 205, 175" : "22, 101, 52"}) 0px 0px 0px 2px inset`,
        green: colorScheme === "dark" ? "#9bcdaf" : "#166534",
      });
      await expect(panel.locator(".hint-effect")).toHaveCSS(
        "color",
        colorScheme === "dark" ? "rgb(155, 205, 175)" : "rgb(22, 101, 52)"
      );
      expect(
        await page
          .locator(".board > .cell")
          .evaluateAll((cells) => cells.map((el) => [el.dataset.value, el.dataset.notes]))
      ).toEqual(before);
      await panel.getByRole("button", { name: "上一個提示", exact: true }).click();
      await expect(page.locator(".board > .cell.hint-target")).toHaveCount(0);
      await expect(panel.locator(".hint-effect")).toHaveCount(0);
      await panel.locator('[data-action="next"]').click();
      await expect(target).toHaveCount(1);
      await panel.locator('[data-action="apply"]').click();
      const placed = page.locator(`.board > .cell[data-i="${targetIndex}"]`);
      await expect(placed).toHaveAttribute("data-value", /^[1-9]$/);
      await expect(page.locator(".board > .cell.hint-target")).toHaveCount(0);
      await panel.locator('[data-action="undo"]').click();
      await expect(placed).toHaveAttribute("data-value", "");
      expect(
        await page
          .locator(".board > .cell")
          .evaluateAll((cells) => cells.map((el) => [el.dataset.value, el.dataset.notes]))
      ).toEqual(before);

      const eliminationPuzzle =
        "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
      await openBoard(page, `./?q=${eliminationPuzzle}`);
      panel = await conclude(page);
      await expect(panel.locator(".hint-effect-placement")).toHaveCount(0);
      await expect(panel.locator(".hint-effect")).toContainText("刪除");
      const red = colorScheme === "dark" ? "rgb(230, 168, 181)" : "rgb(192, 47, 47)";
      await expect(panel.locator(".hint-effect")).toHaveCSS("color", red);
      const removed = page.locator(".board .hint-elimination").first();
      await expect(removed).toHaveCSS("color", red);
      await expect(removed).toHaveCSS("text-decoration-line", "line-through");
      await expect(page.locator(".board > .cell.hint-target")).toHaveCount(0);
    });
  }
}
