import { test, expect } from "@playwright/test";

const PUZZLE = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";

for (const viewport of [
  { width: 320, height: 667 },
  { width: 390, height: 844 },
  { width: 600, height: 800 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
]) {
  test.describe(`Custom puzzle entry at ${viewport.width}px`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
    });

    test("ordinary home opens the editor, keeps its draft, and starts the entered puzzle", async ({
      page,
    }) => {
      await page.goto("./");
      await expect(page.locator(".header .custom-entry")).toHaveCount(0);
      const entry = page.getByRole("button", { name: "Custom puzzle", exact: true });
      await expect(entry).toBeVisible();
      const box = await entry.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      await entry.focus();
      await page.keyboard.press("Enter");
      const cells = page.locator(".input-cell");
      await expect(cells).toHaveCount(81);
      await expect(cells.first()).toBeFocused();
      await page.keyboard.press("7");
      await expect(cells.first()).toHaveText("7");
      await page.getByRole("button", { name: "Back to daily puzzles" }).click();
      await expect(page.locator(".journal")).toBeVisible();
      await expect(entry).toBeFocused();
      await entry.click();
      await expect(cells.first()).toHaveText("7");
      await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
      await page.getByRole("textbox", { name: "Puzzle link or 81 digits" }).fill(PUZZLE);
      await page.getByRole("button", { name: "Start puzzle" }).click();
      await expect(page.locator(".board > .cell.given")).toHaveCount(30);
      await expect(page.locator(".custom-editor")).toHaveCount(0);
      expect(new URL(page.url()).search).toBe("");
    });

    test("More opens the editor without changing the current game", async ({ page }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "Play", exact: true }).click();
      const empty = page.locator(".board > .cell:not(.given)").first();
      const id = await empty.getAttribute("data-i");
      await empty.click();
      await page.keyboard.press("9");
      await expect(empty).toHaveAttribute("data-value", "9");
      await page.locator("[data-more]").filter({ visible: true }).click();
      await page.locator("#opt-custom").click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
      await expect(page.locator(".input-cell")).toHaveCount(81);
      await page.keyboard.press("4");
      await expect(page.locator(".input-cell").first()).toHaveText("4");
      await page.getByRole("button", { name: "Back to daily puzzles" }).click();
      await page.getByRole("button", { name: "Back to game", exact: true }).click();
      await expect(page.locator(`.board > .cell[data-i="${id}"]`)).toHaveAttribute(
        "data-value",
        "9"
      );
      await page.keyboard.press("Control+z");
      await expect(page.locator(`.board > .cell[data-i="${id}"]`)).toHaveAttribute(
        "data-value",
        ""
      );
    });

    test("shared links preview the givens and require Start before loading the game", async ({
      page,
    }) => {
      await page.goto(`./?q=${PUZZLE}`);
      await expect(page.getByRole("heading", { name: "Review puzzle" })).toBeVisible();
      await expect(page.locator(".input-cell.given")).toHaveCount(30);
      await expect(page.locator(".board > .cell")).toHaveCount(0);
      await page.getByRole("button", { name: "Edit board", exact: true }).click();
      const toolbar = page.getByRole("toolbar", { name: "Board tools" });
      expect(
        await toolbar
          .locator(".history-tools > button")
          .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
      ).toEqual(["Enter blank", "Undo", "Redo", "Erase selected cell"]);
      await expect(toolbar.locator(".tool-divider")).toHaveCount(2);
      await expect(page.locator(".draft-key")).toHaveCount(9);
      await expect(page.locator(".input-cell.given")).toHaveCount(30);
      await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
      await expect(page.locator(".board > .cell.given")).toHaveCount(30);
    });

    test("Blank and history edit only the draft; copying exports its 81 digits", async ({
      page,
    }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
      const cells = page.locator(".input-cell");
      await page.getByRole("button", { name: "Enter 1", exact: true }).click();
      await page.getByRole("button", { name: "Enter blank", exact: true }).click();
      await expect(cells.nth(2)).toBeFocused();
      await page.getByRole("button", { name: "Enter 2", exact: true }).click();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(cells.nth(2)).toHaveText("");
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      await expect(cells.nth(2)).toHaveText("2");
      await page.evaluate(() => {
        window["customCopied"] = "";
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async (value) => (window["customCopied"] = value) },
        });
      });
      await page.getByRole("button", { name: "Share puzzle", exact: true }).click();
      const digits = `102${"0".repeat(78)}`;
      await expect(page.getByRole("textbox", { name: "Puzzle string (81 digits)" })).toHaveValue(
        digits
      );
      await page.getByRole("button", { name: "Copy 81 digits", exact: true }).click();
      expect(await page.evaluate(() => window["customCopied"])).toBe(digits);
      await page.getByRole("button", { name: "Close copy dialog" }).click();
      await expect(page.locator(".board > .cell")).toHaveCount(0);
    });

    test("approved layout keeps controls visible and Clear remains undoable", async ({ page }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
      await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
      await page.getByRole("textbox", { name: "Puzzle link or 81 digits" }).fill(PUZZLE);
      await page.getByRole("button", { name: "Fill board", exact: true }).click();
      const clear = page.getByRole("button", { name: "Clear all givens", exact: true });
      await expect(clear).toHaveText("Clear");
      await expect(clear.locator("span")).toBeVisible();
      await expect(clear).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(clear).toHaveCSS("border-top-width", "0px");
      await expect(page.getByRole("switch", { name: "Auto-advance" })).toHaveCount(0);
      if (viewport.width < 600) {
        await expect
          .poll(() =>
            page.locator(".editor-body").evaluate((el) => el.scrollHeight - el.clientHeight)
          )
          .toBeLessThanOrEqual(1);
        const pad = await page.locator(".input-keypad").boundingBox();
        const key = await page.locator(".draft-key").first().boundingBox();
        const footer = await page.locator(".action-panel").boundingBox();
        expect(key.height).toBeGreaterThanOrEqual(44.7);
        expect(pad.y + pad.height).toBeLessThanOrEqual(footer.y);
        expect(footer.y + footer.height).toBeLessThanOrEqual(viewport.height);
        await expect(page.locator(".action-panel")).toHaveCSS("border-top-width", "1px");
        expect(
          await page
            .locator(".action-panel")
            .evaluate((el) => getComputedStyle(el, "::before").content)
        ).toBe("none");
        if (viewport.width === 390) {
          expect(key.height).toBeCloseTo(57.6, 1);
          expect(pad.width).toBeCloseTo(342 * 0.9, 1);
        }
      }
      await clear.click();
      await expect(page.locator(".input-cell.given")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.locator(".input-cell.given")).toHaveCount(30);
    });
  });
}

test("draft keypad refits after resizing, errors and repeated input-mode changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
  const keyHeight = () =>
    page
      .locator(".draft-key")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
  const overflow = () =>
    page.locator(".editor-body").evaluate((el) => el.scrollHeight - el.clientHeight);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
    await page.getByRole("textbox", { name: "Puzzle link or 81 digits" }).fill(PUZZLE);
    await page.getByRole("button", { name: "Fill board", exact: true }).click();
    await expect.poll(keyHeight).toBeCloseTo(57.6, 1);
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(keyHeight).toBeCloseTo(44.8, 1);
  await expect.poll(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Enter 3", exact: true }).click();
  await expect(page.locator(".board-error")).toContainText("Repeated numbers");
  await expect.poll(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(keyHeight).toBeCloseTo(52, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(keyHeight).toBeCloseTo(57.6, 1);
  await expect(page.locator(".input-cell.given")).toHaveCount(30);
});

test.describe("Custom puzzle validation", () => {
  test.use({ reducedMotion: "reduce" });

  for (const query of [
    "q=123",
    `q=${PUZZLE}&q=${PUZZLE}`,
    `q=${"0".repeat(81)}`,
    `q=11${"0".repeat(79)}`,
  ]) {
    test(`invalid shared puzzle cannot start: ${query.slice(0, 14)}`, async ({ page }) => {
      const dialogs = [];
      page.on("dialog", async (dialog) => {
        dialogs.push(dialog.message());
        await dialog.dismiss();
      });
      await page.goto(`./?${query}`);
      await expect(page.locator(".custom-editor")).toBeVisible();
      await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeDisabled();
      await expect(page.locator(".board > .cell")).toHaveCount(0);
      expect(dialogs).toEqual([]);
    });
  }

  test("bad pasted URL preserves the draft and requires correction; clipboard denial stays inline", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
    await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Puzzle link or 81 digits" });
    await input.fill(PUZZLE);
    await expect(page.locator(".input-cell.given")).toHaveCount(30);
    await input.fill("https://example.com/?q=123");
    await expect(page.locator(".input-cell.given")).toHaveCount(30);
    await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeDisabled();
    await input.fill(`https://example.com/?q=${PUZZLE}`);
    await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeEnabled();
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          readText: async () => {
            throw new Error("denied");
          },
        },
      })
    );
    await page.getByRole("button", { name: "Paste from clipboard", exact: true }).click();
    await expect(page.locator(".import-error")).toContainText("Clipboard unavailable");
    await expect(page.locator(".input-cell.given")).toHaveCount(30);
    await input.fill(PUZZLE);
    await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeEnabled();
  });
});

for (const viewport of [
  { width: 402, height: 874 },
  { width: 402, height: 720 },
  { width: 320, height: 667 },
]) {
  test.describe(`A3 compact input at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    test("keeps Paste beside the count and removes the redundant heading", async ({ page }) => {
      await page.goto("./");
      await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Starting board", exact: true })).toHaveCount(
        0
      );
      await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
      const input = page.getByRole("textbox", { name: "Puzzle link or 81 digits" });
      await input.fill(PUZZLE);
      await expect(input).toHaveCSS("font-size", "16px");
      const paste = await page
        .getByRole("button", { name: "Paste from clipboard", exact: true })
        .boundingBox();
      const meta = await page.locator(".string-meta").boundingBox();
      expect(paste.height).toBeGreaterThanOrEqual(44);
      expect(paste.x).toBeGreaterThanOrEqual(meta.x + meta.width - 1);
      expect(meta.y).toBeGreaterThanOrEqual(paste.y);
      expect(meta.y + meta.height).toBeLessThanOrEqual(paste.y + paste.height);
      await expect
        .poll(() =>
          page.locator(".editor-body").evaluate((el) => el.scrollHeight - el.clientHeight)
        )
        .toBeLessThanOrEqual(1);
      await expect(page.getByRole("button", { name: "Start puzzle", exact: true })).toBeEnabled();
    });
  });
}
