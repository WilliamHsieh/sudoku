import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

async function boardData(page) {
  return page.locator(".board > .cell").evaluateAll((cells) =>
    cells.map((cell) => ({
      value: cell.getAttribute("data-value"),
      notes: cell.getAttribute("data-notes"),
      visible: [...cell.querySelectorAll(".pencil-box:not(.invisible)")].map((note) =>
        note.textContent.trim()
      ),
    }))
  );
}
async function storyTap(page, position) {
  const point = await page.locator("#hint-panel .hint-body").evaluate((el, position) => {
    const rect = el.getBoundingClientRect();
    const x =
      rect.left +
      (position === "left"
        ? 4
        : position === "right"
          ? el.clientWidth - 4
          : el.clientWidth * position);
    // Exercise ordinary reading-area taps, not a coordinate button that would
    // independently suppress navigation and hide a center-tap regression.
    for (const offset of [4, 12, 24, el.clientHeight / 2, el.clientHeight - 4]) {
      const y = rect.top + offset;
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest(".hint-body") === el && !hit.closest("button, a")) return { x, y };
    }
    return null;
  }, position);
  expect(point, `a non-interactive reading-area point at ${position}`).not.toBeNull();
  await page.mouse.click(point.x, point.y);
}
const unrelated =
  ".board > .cell:is(.selected, .same, .conflict, .blocking, .blocked, .undo-target, .paint-add, .paint-remove, .finger-add, .finger-remove, .af-filled, .af-skipped, .af-undone), .board .pencil-box:is(.selected, .matching-number, .aim, .cue, .cue-hold, .ghost, .paint-added, .preview-add, .preview-remove, .hidden-pending), .board .pen-box .conflict";

for (const width of [390, 1280]) {
  test(`hint focus and story navigation keep board data unchanged at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openBoard(page);
    const given = page.locator('.board > .cell[data-i="1"]');
    await given.click();
    await page.keyboard.press("Shift+Digit5");
    await expect(given).toHaveClass(/selected/);
    const before = await boardData(page);
    await page.locator("#hint-trigger").click();
    const panel = page.locator("#hint-panel");
    await expect(panel.locator(".hint-position")).toHaveText("1/3");
    await expect(page.locator(".board")).toHaveAttribute("data-hint-isolated", "true");
    await expect(page.locator(unrelated)).toHaveCount(0);
    await expect(panel.locator(".hint-body")).not.toContainText(/Auto|Tidy|不會.*筆記|disclaimer/);
    await expect(panel.getByRole("button", { name: "上一個提示", exact: true })).toBeDisabled();
    for (let stage = 0; stage < 3; stage++) {
      for (const position of [0.25, 0.5, 0.75]) {
        await storyTap(page, position);
        await expect(panel.locator(".hint-position")).toHaveText(`${stage + 1}/3`);
      }
      const ref = panel.locator(".hint-body :is(.hint-reference, .hint-coordinate)").first();
      await expect(ref).toBeVisible();
      const cell = page.locator(`.board > .cell[data-i="${await ref.getAttribute("data-cell")}"]`);
      await ref.click();
      await expect(cell).toHaveClass(/hint-focus/);
      await expect(panel.locator(".hint-position")).toHaveText(`${stage + 1}/3`);
      await expect(page.locator(unrelated)).toHaveCount(0);
      expect(await boardData(page)).toEqual(before);
      if (stage === 1) {
        await ref.focus();
        await page.keyboard.press("Enter");
        await expect(cell).toHaveClass(/hint-focus/);
        await expect(ref).toBeFocused();
        await page.waitForTimeout(950);
        await expect(page.locator(".board .hint-focus")).toHaveCount(0);
      }
      if (stage < 2) {
        await storyTap(page, "right");
        await expect(panel.locator(".hint-position")).toHaveText(`${stage + 2}/3`);
        await expect(page.locator(".board .hint-focus")).toHaveCount(0);
      }
    }
    await storyTap(page, "right");
    await expect(panel.locator(".hint-position")).toHaveText("3/3");
    await expect(panel.locator('[data-action="apply"]')).toBeVisible();
    expect(await boardData(page)).toEqual(before);
    await storyTap(page, "left");
    await expect(panel.locator(".hint-position")).toHaveText("2/3");
    const previous = panel.getByRole("button", { name: "上一個提示", exact: true });
    await previous.focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator(".hint-position")).toHaveText("1/3");
    await storyTap(page, "left");
    await expect(panel.locator(".hint-position")).toHaveText("1/3");
    await panel.getByRole("button", { name: "下一個提示", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(panel.locator(".hint-position")).toHaveText("2/3");
    await panel.locator(".hint-body").focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await expect(panel.locator(".hint-position")).toHaveText("2/3");
    await panel.getByRole("button", { name: "收起提示" }).click();
    await expect(
      page.locator(
        ".board .hint-focus, .board .hint-observe, .board .hint-premise, .board .hint-target"
      )
    ).toHaveCount(0);
    await expect(given).toHaveClass(/selected/);
    expect(await boardData(page)).toEqual(before);
  });
}

test("reduced-motion coordinate focus stays still, and selection/dragging do not navigate", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoard(page, undefined);
  await page.locator("#hint-trigger").click();
  const panel = page.locator("#hint-panel");
  const ref = panel.locator(".hint-body :is(.hint-reference, .hint-coordinate)").first();
  await ref.click();
  const focus = page.locator(".board .hint-focus");
  await expect(focus).toHaveCount(1);
  expect(await focus.evaluate((el) => getComputedStyle(el, "::before").animationName)).toBe("none");
  await panel
    .locator(".hint-body p")
    .first()
    .evaluate((p) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(p);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await storyTap(page, "right");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await page.evaluate(() => window.getSelection().removeAllRanges());
  const rect = await panel.locator(".hint-body").boundingBox();
  await page.mouse.move(rect.x + rect.width - 5, rect.y + 20);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 5, rect.y + 50, { steps: 4 });
  await page.mouse.up();
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
});

test("hint entry settles a pending toolbar undo once and preserves later ring bindings", async ({
  page,
}) => {
  await openBoard(page);
  const first = page.locator('.board > .cell[data-i="0"]');
  await first.click();
  await page.keyboard.press("1");
  await expect(first).toHaveAttribute("data-value", "1");
  // Start both controls in the same browser task, before the travelling Undo
  // ring reaches its landing point. Hint preparation must finish it once.
  await page.evaluate(() => {
    document.getElementById("undo").click();
    document.getElementById("hint-trigger").click();
  });
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  await expect(first).toHaveAttribute("data-value", "");
  await page.waitForTimeout(1100);
  await expect(first).toHaveAttribute("data-value", "");
  await page.locator('#hint-panel [data-action="close"]').click();
  await page.locator("#redo").click();
  await expect(first).toHaveAttribute("data-value", "1");
  await page.locator("#undo").click();
  await expect(first).toHaveAttribute("data-value", "");
});

test("normal matching-candidate hover keeps the existing chip appearance", async ({ page }) => {
  await openBoard(page);
  await page.locator('.board > .cell[data-i="1"]').click();
  const matching = page.locator(".board .pencil-box.matching-number:not(.invisible)").first();
  await expect(matching).toBeVisible();
  const style = () =>
    matching.evaluate((el) => {
      const css = getComputedStyle(el);
      return { color: css.color, background: css.backgroundColor };
    });
  await page.mouse.move(1, 1);
  const before = await style();
  await matching.hover();
  expect(await style()).toEqual(before);
});
