import { test, expect } from "@playwright/test";
import { findStep } from "../src/hints/engine.js";
import { pencil } from "./helpers.js";
import { openPhaseThreeCase, phaseThreeCases } from "./phase-three-cases.js";

// Video is worker-scoped, so Playwright requires this setting at file scope.
// A post-green capture-only branch can enable it without changing app sources.
test.use({ video: { mode: "on", size: { width: 1280, height: 844 } } });

for (const example of phaseThreeCases.filter((row) => row.width === 1280)) {
  test.describe(`${example.technique} at ${example.width}`, () => {
    test("real Worker explains, applies and undoes a phase-three deduction", async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      const fixture = await openPhaseThreeCase(page, example);
      const step = findStep([...fixture.values].map(Number), fixture.masks);
      expect(step?.techniqueId).toBe(example.id);
      expect(step.eliminations.length).toBeGreaterThan(0);
      const before = await page
        .locator(".board > .cell")
        .evaluateAll((cs) => cs.map((c) => c.getAttribute("data-notes")));
      for (const effect of step.eliminations)
        await expect(pencil(page, effect.cell, effect.digit)).not.toHaveClass(/invisible/);
      const [worker] = await Promise.all([
        page.waitForEvent("worker"),
        page.locator("#hint-trigger").click(),
      ]);
      expect(worker.url()).toMatch(/engine\.worker/);
      const panel = page.locator("#hint-panel");
      await expect(panel.locator(".hint-position")).toHaveText("1/3");
      await page.waitForTimeout(1000);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".technique")).toHaveText(example.technique);
      await info.attach("reasoning", { body: await page.screenshot(), contentType: "image/png" });
      await page.waitForTimeout(1600);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".hint-position")).toHaveText("3/3");
      for (const effect of step.eliminations)
        await expect(pencil(page, effect.cell, effect.digit)).toHaveClass(/hint-elimination/);
      await info.attach("conclusion", { body: await page.screenshot(), contentType: "image/png" });
      await page.waitForTimeout(1000);
      await panel.locator('[data-action="apply"]').click();
      await expect(panel).toContainText(`已刪除 ${step.eliminations.length} 個候選數`);
      for (const effect of step.eliminations)
        await expect(pencil(page, effect.cell, effect.digit)).toHaveClass(/invisible/);
      await page.waitForTimeout(1000);
      await panel.locator('[data-action="undo"]').click();
      await expect(panel).toHaveCount(0);
      expect(
        await page
          .locator(".board > .cell")
          .evaluateAll((cs) => cs.map((c) => c.getAttribute("data-notes")))
      ).toEqual(before);
      await page.waitForTimeout(600);
    });
  });
}
