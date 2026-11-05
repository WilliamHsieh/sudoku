import { expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

const puzzle = "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
const sourceGreenHead = "d15289097efe570f565466b730f31301d6db7991";
const mergedHead = "087e137e2d1380f01048b218e97deb548265542f";
const boardData = (page) =>
  page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.map((el) => [el.dataset.value, el.dataset.notes]));

export async function recordCandidateElimination(page, testInfo, mobile) {
  const activate = (locator) => (mobile ? locator.tap() : locator.click());
  await openBoard(page, `./?q=${puzzle}`);
  const before = await boardData(page);
  const target = page.locator('.board > .cell[data-i="77"]');
  const five = target.locator('.pencil-box[data-d="5"]');
  await expect(five).not.toHaveClass(/invisible/);
  const [worker] = await Promise.all([
    page.waitForEvent("worker"),
    activate(page.locator("#hint-trigger")),
  ]);
  expect(worker.url()).toMatch(/engine\.worker/);
  const panel = page.locator("#hint-panel");
  const position = panel.locator(".hint-position");
  await expect(position).toHaveText("1/3");
  await page.waitForTimeout(2200);
  const tapBody = async (side) => {
    const rect = await panel.locator(".hint-body").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: el.clientWidth, height: el.clientHeight };
    });
    const x =
      side === "left"
        ? rect.x + 4
        : side === "right"
          ? rect.x + rect.width - 4
          : rect.x + rect.width / 2;
    const y = side === "center" ? rect.y + rect.height - 4 : rect.y + 24;
    if (mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  await tapBody("center");
  await expect(position).toHaveText("1/3");
  await tapBody("right");
  await expect(position).toHaveText("2/3");
  await expect(panel.locator(".technique")).toHaveText("顯性數對");
  await expect(page.locator(".board .hint-elimination")).toHaveCount(0);
  await page.waitForTimeout(4000);
  await tapBody("left");
  await expect(position).toHaveText("1/3");
  await page.waitForTimeout(1200);
  await tapBody("right");
  await expect(position).toHaveText("2/3");
  await page.waitForTimeout(900);
  await tapBody("right");
  await expect(position).toHaveText("3/3");
  await expect(panel.locator(".hint-effect")).toHaveText("r9c6 刪除 5");
  await expect(panel.locator(".hint-effect")).toHaveCSS("color", "rgb(230, 168, 181)");
  await expect(five).toHaveClass(/hint-elimination/);
  await expect(five).toHaveCSS("color", "rgb(230, 168, 181)");
  await expect(five).toHaveCSS("text-decoration-line", "line-through");
  await expect(page.locator(".board > .cell.hint-target")).toHaveCount(0);
  expect(await boardData(page)).toEqual(before);
  await panel.locator(".hint-effect").scrollIntoViewIfNeeded();
  await page.waitForTimeout(4500);
  await activate(panel.locator(".hint-effect .hint-reference").first());
  await expect(target).toHaveClass(/hint-focus/);
  await expect(position).toHaveText("3/3");
  await page.waitForTimeout(1100);
  await activate(panel.locator('[data-action="apply"]'));
  await expect(panel).toContainText("已刪除 1 個候選數");
  await expect(five).toHaveClass(/invisible/);
  const after = await boardData(page);
  expect(after).toEqual(
    before.map((value, index) => (index === 77 ? [value[0], value[1].replace("5", "")] : value))
  );
  await page.waitForTimeout(3000);
  await activate(panel.locator('[data-action="undo"]'));
  await expect(panel).toHaveCount(0);
  await expect(five).not.toHaveClass(/invisible/);
  expect(await boardData(page)).toEqual(before);
  await page.waitForTimeout(2200);
  await testInfo.attach("candidate-elimination-evidence", {
    body: JSON.stringify(
      {
        sourceGreenHead,
        mergedHead,
        captureHead: process.env.SUDOKU_BUILD_VERSION,
        mobileEmulation: mobile,
        technique: "naked-pair",
        effect: "r9c6 刪除 5",
        worker: worker.url(),
        onlyTargetCandidateRemoved: true,
        undoRestoredAllData: true,
        centerTapInert: true,
        edgeNavigationVerified: true,
      },
      null,
      2
    ),
    contentType: "application/json",
  });
}
