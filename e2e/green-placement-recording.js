import { expect } from "@playwright/test";
import { DEMO_PUZZLE, openBoard } from "./helpers.js";

const published = "https://williamhsieh.github.io/sudoku/";
const baselineHead = "0ccf5998f30f933ad8f951d1110bef8e439cc1f7";
const eliminationPuzzle =
  "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
const boardData = (page) =>
  page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.map((el) => [el.dataset.value, el.dataset.notes]));

export async function recordPlacementComparison(page, testInfo, mobile) {
  const activate = (locator) => (mobile ? locator.tap() : locator.click());
  const response = await page.request.get(`${published}version.json`);
  expect(response.ok()).toBe(true);
  expect((await response.json()).version).toBe(baselineHead);
  const observations = [];
  for (const version of ["published-red", "preview-green"]) {
    await openBoard(page, version === "published-red" ? `${published}?q=${DEMO_PUZZLE}` : "./");
    const before = await boardData(page);
    const [worker] = await Promise.all([
      page.waitForEvent("worker"),
      activate(page.locator("#hint-trigger")),
    ]);
    expect(worker.url()).toMatch(/engine\.worker/);
    const panel = page.locator("#hint-panel");
    await expect(panel.locator(".hint-position")).toHaveText("1/3");
    await page.waitForTimeout(1400);
    await activate(panel.locator('[data-action="next"]'));
    await expect(panel.locator(".hint-position")).toHaveText("2/3");
    await page.waitForTimeout(1600);
    await activate(panel.locator('[data-action="next"]'));
    const target = page.locator(".board > .cell.hint-target");
    await expect(target).toHaveCount(1);
    const effect = panel.locator(".hint-effect");
    await expect(effect).toContainText("填入");
    const color = version === "published-red" ? "rgb(230, 168, 181)" : "rgb(155, 205, 175)";
    await expect(effect).toHaveCSS("color", color);
    await expect(target).toHaveCSS("box-shadow", `${color} 0px 0px 0px 2px inset`);
    observations.push({
      version,
      color,
      effect: await effect.innerText(),
      target: await target.getAttribute("data-i"),
      worker: worker.url(),
    });
    await effect.scrollIntoViewIfNeeded();
    await page.waitForTimeout(4200);
    await activate(effect.locator(".hint-reference").first());
    await expect(target).toHaveClass(/hint-focus/);
    await page.waitForTimeout(1100);
    expect(await boardData(page)).toEqual(before);
    if (version === "preview-green") {
      const targetIndex = await target.getAttribute("data-i");
      await activate(panel.locator('[data-action="apply"]'));
      await expect(panel).toContainText("這一步已完成");
      await expect(page.locator(`.board > .cell[data-i="${targetIndex}"]`)).toHaveAttribute(
        "data-value",
        /^[1-9]$/
      );
      await page.waitForTimeout(1800);
      await activate(panel.locator('[data-action="undo"]'));
      await expect(panel).toHaveCount(0);
      expect(await boardData(page)).toEqual(before);
      await page.waitForTimeout(1000);
    }
  }
  await openBoard(page, `./?q=${eliminationPuzzle}`);
  await activate(page.locator("#hint-trigger"));
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await page.waitForTimeout(600);
  await activate(panel.locator('[data-action="next"]'));
  await page.waitForTimeout(700);
  await activate(panel.locator('[data-action="next"]'));
  await expect(panel.locator(".hint-effect")).toContainText("刪除");
  await expect(panel.locator(".hint-effect")).toHaveCSS("color", "rgb(230, 168, 181)");
  await expect(page.locator(".board .hint-elimination").first()).toHaveCSS(
    "text-decoration-line",
    "line-through"
  );
  await panel.locator(".hint-effect").scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
  await testInfo.attach("placement-color-comparison", {
    body: JSON.stringify(
      {
        baselineHead,
        previewHead: process.env.SUDOKU_BUILD_VERSION,
        mobileEmulation: mobile,
        observations,
      },
      null,
      2
    ),
    contentType: "application/json",
  });
}
