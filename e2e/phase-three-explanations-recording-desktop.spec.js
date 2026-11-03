import { test, expect } from "@playwright/test";
import { findStep } from "../src/hints/engine.js";
import { pencil } from "./helpers.js";
import { openPhaseThreeCase, phaseThreeCases } from "./phase-three-cases.js";

// Video is worker-scoped, so Playwright requires this setting at file scope.
// A post-green capture-only branch can enable it without changing app sources.
test.use({ video: { mode: "on", size: { width: 1280, height: 844 } } });
// Pause on every real paragraph so the recording shows the full causal proof.
// This changes camera pacing only, never the app or its input state.
async function readExplanation(page, panel) {
  for (const paragraph of await panel.locator(".hint-body > p").all()) {
    await paragraph.evaluate((element) => {
      const body = element.closest(".hint-body");
      const top =
        element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top, behavior: "smooth" });
    });
    await page.waitForTimeout(400);
    await expect(paragraph).toBeInViewport();
    const text = await paragraph.innerText();
    await page.waitForTimeout(Math.min(6500, Math.max(1600, text.length * 45)));
  }
}

for (const example of phaseThreeCases.filter((example) => example.width === 1280)) {
  test.describe(`${example.technique} at ${example.width}`, () => {
    test("record revised real Worker explanation, apply and undo", async ({ page }, info) => {
      test.setTimeout(180000);
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
      await expect(paragraphs).toHaveCount(step.teaching.observe.length + 1);
      for (const [index, observation] of step.teaching.observe.entries())
        await expect(paragraphs.nth(index)).toHaveText(observation);
      await info.attach("observation", { body: await page.screenshot(), contentType: "image/png" });
      await readExplanation(page, panel);
      await panel.locator('[data-action="next"]').click();
      await expect(panel.locator(".technique")).toHaveText(example.technique);
      await expect(panel.locator("h2")).toHaveText(step.teaching.reasonTitle);
      await expect(paragraphs).toHaveText(step.teaching.reasoning);
      await info.attach("reasoning", { body: await page.screenshot(), contentType: "image/png" });
      // Long proofs remain complete and keyboard/scroll reachable, including
      // the final causal bridge. The footer controls stay outside this region.
      await readExplanation(page, panel);
      await expect(panel.locator('[data-action="next"]')).toBeInViewport();
      await page.waitForTimeout(600);
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
      await readExplanation(page, panel);
      await panel.locator(".hint-effect").scrollIntoViewIfNeeded();
      await page.waitForTimeout(1600);
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
