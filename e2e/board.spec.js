// Characterization tests: lock the current master behaviour of the board.
// Demo puzzle row 1 is `0 5 0 9 0 0 0 0 0`; cell 0 is empty with candidates 2 3 4 6 7,
// cell 1 is a given 5.
import { test, expect } from "@playwright/test";
import {
  SELECTED_BG,
  GIVEN_BG,
  SAME_DIGIT_GIVEN_BG,
  cell,
  pencil,
  pen,
  openBoard,
  expectValue,
  measureBoard,
  expectUnclippedEqualCells,
  expectSameGeometry,
  readDigitFonts,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("the number pad is a mobile-only control", async ({ page }) => {
  await expect(page.locator(".keypad")).toHaveCount(1);
  await expect(page.locator(".keypad")).not.toBeVisible();
  await expect(page.locator(".tools")).not.toBeVisible();
});

test("highlight chips, conflict and notes do not resize the board or cells", async ({ page }) => {
  const before = await measureBoard(page);
  expectUnclippedEqualCells(before);

  await cell(page, 1).click(); // given 5: same-digit chips
  await cell(page, 0).click();
  await page.keyboard.press("5"); // conflict with the given 5, notes still in peers
  await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
  await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();

  const after = await measureBoard(page);
  expectUnclippedEqualCells(after);
  expectSameGeometry(before, after);
});

test("pad digits are Atkinson 400; board givens and answers use the system font", async ({
  page,
}) => {
  await cell(page, 0).click();
  await page.keyboard.press("4");
  const fonts = await readDigitFonts(page);
  expect(fonts.pad.family).toMatch(/Atkinson Hyperlegible/);
  expect(fonts.pad.weight).toBe("400");
  expect(fonts.given.family).not.toMatch(/Atkinson/);
  expect(fonts.given.weight).toBe("700");
  expect(fonts.answer.family).not.toMatch(/Atkinson/);
  expect(fonts.answer.weight).toBe("400");
  expect(fonts.answer.family).toBe(fonts.given.family);
  expect(fonts.atkinsonBold).toBe(0);
});

test("desktop matching chips keep master's slot size at 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await cell(page, 1).click(); // given 5 — same-digit chips on notes
  const chip = page.locator(".pencil-box.matching-number").first();
  await expect(chip).toBeVisible();
  const sizes = await page.evaluate(() => {
    for (const chip of document.querySelectorAll(".pencil-box.matching-number")) {
      const plain = chip.parentElement?.querySelector(
        ".pencil-box:not(.invisible):not(.matching-number)"
      );
      if (!plain) continue;
      const a = chip.getBoundingClientRect();
      const b = plain.getBoundingClientRect();
      return { chipW: a.width, chipH: a.height, slotW: b.width, slotH: b.height };
    }
    return null;
  });
  expect(sizes).not.toBeNull();
  expect(sizes.chipW).toBeCloseTo(sizes.slotW, 0);
  expect(sizes.chipH).toBeCloseTo(sizes.slotH, 0);
});

test("starts with no selection; givens are shaded", async ({ page }) => {
  await expect(cell(page, 1)).toHaveCSS("background-color", GIVEN_BG);
  await expect(cell(page, 0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expectValue(page, 1, 5);
  await expectValue(page, 0, 0);
});

test("click selects a cell; clicking the title deselects", async ({ page }) => {
  await cell(page, 0).click();
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
  await cell(page, 10).click();
  await expect(cell(page, 10)).toHaveCSS("background-color", SELECTED_BG);
  await expect(cell(page, 0)).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.locator("h1").click();
  await expect(cell(page, 10)).not.toHaveCSS("background-color", SELECTED_BG);
  await page.keyboard.press("4");
  await expectValue(page, 10, 0);
});

test("selecting a filled cell highlights the same digit elsewhere", async ({ page }) => {
  await cell(page, 1).click(); // given 5
  await expect(cell(page, 27)).toHaveCSS("background-color", SAME_DIGIT_GIVEN_BG); // r4c1 is 5
});

test("typing a digit fills the selected cell; another digit replaces it; 0 clears", async ({
  page,
}) => {
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await page.keyboard.press("7");
  await expectValue(page, 0, 7);
  await page.keyboard.press("0");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0).locator(".pencil-box")).toHaveCount(9);
});

test("typing the same digit twice keeps it", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
});

test("Ctrl+4 enters 4", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("Control+4");
  await expectValue(page, 0, 4);
});

test("a conflicting digit is accepted and marked", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("5"); // 5 is already in the row
  await expectValue(page, 0, 5);
  await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
  await expect(cell(page, 1).locator(".conflict")).toHaveCount(1);
});

test("arrow keys move the selection and stop at the edges", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
  await page.keyboard.press("ArrowRight");
  await expect(cell(page, 1)).toHaveCSS("background-color", SELECTED_BG);
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 10)).toHaveCSS("background-color", SELECTED_BG);
  await page.keyboard.press("3");
  await expectValue(page, 10, 3);

  await cell(page, 80).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 80)).toHaveCSS("background-color", SELECTED_BG);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await expect(cell(page, 70)).toHaveCSS("background-color", SELECTED_BG);
});

test("givens are protected from typing and right-click", async ({ page }) => {
  await cell(page, 1).click();
  await page.keyboard.press("7");
  await expectValue(page, 1, 5);
  await page.keyboard.press("0");
  await expectValue(page, 1, 5);
  await cell(page, 1).click({ button: "right" });
  await expectValue(page, 1, 5);
});

test("right-click clears the selected cell and restores its hidden pencil marks", async ({
  page,
}) => {
  await cell(page, 0).click();
  await pencil(page, 0, 2).click();
  await expect(pencil(page, 0, 2)).toHaveClass(/invisible/);
  await page.keyboard.press("4");
  await cell(page, 0).click({ button: "right" });
  await expectValue(page, 0, 0);
  await expect(pencil(page, 0, 2)).not.toHaveClass(/invisible/);

  // Empty cell: right-click alone also restores hidden marks.
  await pencil(page, 0, 3).click();
  await expect(pencil(page, 0, 3)).toHaveClass(/invisible/);
  await cell(page, 0).click({ button: "right" });
  await expect(pencil(page, 0, 3)).not.toHaveClass(/invisible/);
});

test("right-click on a cell that is not selected does nothing", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await cell(page, 2).click();
  await cell(page, 0).click({ button: "right" });
  await expectValue(page, 0, 4);
  await expect(cell(page, 2)).toHaveCSS("background-color", SELECTED_BG);
});

test("pencil marks show the legal candidates of empty cells", async ({ page }) => {
  const visible = [];
  for (let d = 1; d <= 9; d++) {
    const hidden = /invisible/.test((await pencil(page, 0, d).getAttribute("class")) ?? "");
    if (!hidden) visible.push(d);
  }
  expect(visible).toEqual([2, 3, 4, 6, 7]);
  await cell(page, 2).click();
  await page.keyboard.press("3");
  await expect(pencil(page, 0, 3)).toHaveClass(/invisible/);
});

test("clicking a pencil mark of the selected cell hides it; clicking again restores it", async ({
  page,
}) => {
  await pencil(page, 0, 2).click(); // first click only selects
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
  await expect(pencil(page, 0, 2)).not.toHaveClass(/invisible/);

  await pencil(page, 0, 2).click();
  await expect(pencil(page, 0, 2)).toHaveClass(/invisible/);
  await pencil(page, 0, 2).click();
  await expect(pencil(page, 0, 2)).not.toHaveClass(/invisible/);
  await expectValue(page, 0, 0);
});

test("Shift+click on a visible pencil mark enters it, selected or not", async ({ page }) => {
  await pencil(page, 0, 3).click({ modifiers: ["Shift"] });
  await expectValue(page, 0, 3);
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);

  await cell(page, 0).click({ button: "right" });
  await expectValue(page, 0, 0);
  await pencil(page, 0, 4).click(); // hide 4
  await pencil(page, 0, 4).click({ modifiers: ["Shift"] });
  await expectValue(page, 0, 0);
  await pencil(page, 0, 5).click({ modifiers: ["Shift"] }); // 5 is not a candidate
  await expectValue(page, 0, 0);
  await expect(pen(page, 0)).toHaveCount(0);
});

test("Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo", async ({ page }) => {
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Control+z");
  await expectValue(page, 0, 0);
  await page.keyboard.press("Control+Shift+z");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Control+z");
  await expectValue(page, 0, 0);
  await page.keyboard.press("Control+y");
  await expectValue(page, 0, 4);
  await page.keyboard.press("Meta+z");
  await expectValue(page, 0, 0);
  await page.keyboard.press("Meta+Shift+z");
  await expectValue(page, 0, 4);
});

test("?q= loads a puzzle from the URL", async ({ page }) => {
  const q = "159230000800014700400500310060102578002083000980040006005000823700306005093000067";
  await openBoard(page, `./?q=${q}`);
  for (const i of [0, 1, 2, 3, 4, 9, 80]) await expectValue(page, i, Number(q[i]));
  await expectValue(page, 5, 0);
  await expect(cell(page, 0)).toHaveCSS("background-color", GIVEN_BG);
});
