import { test, expect } from "@playwright/test";
import { findStep } from "../src/hints/engine.js";
import { pencil } from "./helpers.js";
import { openPhaseThreeCase, phaseThreeCases } from "./phase-three-cases.js";

// Video is worker-scoped, so Playwright requires this setting at file scope.
// A post-green capture-only branch can enable it without changing app sources.
test.use({ video: "off" });

for (const example of phaseThreeCases) {
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
      await expect(panel.locator("h2")).toHaveText(step.teaching.observeTitle);
      const paragraphs = panel.locator(".hint-body > p");
      await expect(paragraphs).toHaveCount(step.teaching.observe.length);
      for (const [index, observation] of step.teaching.observe.entries())
        await expect(paragraphs.nth(index)).toHaveText(observation);
      await info.attach("observation", { body: await page.screenshot(), contentType: "image/png" });
      await page.waitForTimeout(1000);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".technique")).toHaveText(example.technique);
      await expect(panel.locator("h2")).toHaveText(step.teaching.reasonTitle);
      await expect(paragraphs).toHaveText(step.teaching.reasoning);
      await info.attach("reasoning", { body: await page.screenshot(), contentType: "image/png" });
      // Long proofs remain complete and keyboard/scroll reachable, including
      // the final causal bridge. The footer controls stay outside this region.
      for (const paragraph of await paragraphs.all()) {
        await paragraph.scrollIntoViewIfNeeded();
        await expect(paragraph).toBeInViewport();
      }
      await expect(panel.locator('[data-action="next"]')).toBeInViewport();
      await page.waitForTimeout(1600);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".hint-position")).toHaveText("3/3");
      await expect(paragraphs).toHaveText(step.teaching.conclusion);
      await expect(panel.locator(".hint-effect")).toHaveText(
        step.eliminations
          .map((e) => `r${Math.floor(e.cell / 9) + 1}c${(e.cell % 9) + 1} 刪除 ${e.digit}`)
          .join("；")
      );
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
