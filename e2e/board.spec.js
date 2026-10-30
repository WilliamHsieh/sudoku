import { switchNotesMode } from "./helpers.js";
// Characterization tests: lock the current master behaviour of the board.
// Demo puzzle row 1 is `0 5 0 9 0 0 0 0 0`; cell 0 is empty with candidates 2 3 4 6 7,
// cell 1 is a given 5.
import { test, expect } from "@playwright/test";
import {
  clearSelection,
  SELECTED_BG,
  GIVEN_BG,
  SAME_DIGIT_GIVEN_BG,
  cell,
  pencil,
  pen,
  openBoard,
  expectValue,
  measureBoard,
  expectSameGeometry,
  expectMasterDesktopTracks,
  expectMasterDesktopPencils,
  readChipGeometry,
  expectChipGeometry,
  readDigitFonts,
  moveToPencil,
  moveToCell,
  dispatchPointerMove,
  expectShiftAgreement,
  expectNoGridShift,
  measureChipLineGaps,
  expectGapsAtLeast,
  expectCornerChipAndAimGaps,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("desktop exposes the shared number pad and editing controls", async ({ page }) => {
  await expect(page.locator(".keypad")).toHaveCount(1);
  await expect(page.locator(".keypad")).toBeVisible();
  await expect(page.locator(".tools")).toBeVisible();
});

test("highlight chips, conflict and notes do not resize the board or cells", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const before = await measureBoard(page);
  expectMasterDesktopTracks(before);
  await expectMasterDesktopPencils(page);

  await cell(page, 1).click(); // given 5: same-digit chips
  await cell(page, 0).click();
  await page.keyboard.press("5"); // conflict with the given 5, notes still in peers
  await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
  await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();

  const after = await measureBoard(page);
  expectMasterDesktopTracks(after);
  await expectMasterDesktopPencils(page);
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

test("desktop board pixels match master at 1280x800 in every play state", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const check = async () => {
    expectMasterDesktopTracks(await measureBoard(page));
    await expectMasterDesktopPencils(page);
  };

  await check(); // idle

  await cell(page, 0).click(); // selected empty
  await check();

  await cell(page, 1).click(); // selected given
  await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();
  await check();

  await cell(page, 0).click();
  await page.keyboard.press("4"); // selected answer
  await expectValue(page, 0, 4);
  await check();

  await cell(page, 2).click(); // undo available: 4 stays, empty selected
  await expectValue(page, 0, 4);
  await check();

  await cell(page, 0).click();
  await page.keyboard.press("5"); // conflict with the given 5
  await expect(cell(page, 0).locator(".conflict")).toHaveCount(1);
  await expect(cell(page, 1)).toHaveCSS("background-color", SAME_DIGIT_GIVEN_BG);
  await check();
});

test("desktop matching chips use --chip-size 0.32 at 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await cell(page, 1).click(); // given 5 — same-digit chips on notes
  const chip = page.locator(".pencil-box.matching-number").first();
  await expect(chip).toBeVisible();
  expectChipGeometry(await readChipGeometry(page));
});

test("chips and aim stay ≥1px from every grid line at 1280", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await cell(page, 1).click();
  const chips = await measureChipLineGaps(page, ".pencil-box.matching-number");
  expectGapsAtLeast(chips, 1);
  await expectCornerChipAndAimGaps(page);
});

test("Shift, chips and aim never move the 81 cell rects at 1280", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const max = await expectNoGridShift(page);
  expect(max).toBe(0);
});

test("starts with no selection; givens are shaded", async ({ page }) => {
  await expect(cell(page, 1)).toHaveCSS("background-color", GIVEN_BG);
  await expect(cell(page, 0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expectValue(page, 1, 5);
  await expectValue(page, 0, 0);
});

test("click selects a cell; the Journal brand clears the selection", async ({ page }) => {
  await cell(page, 0).click();
  await expect(cell(page, 0)).toHaveCSS("background-color", SELECTED_BG);
  await cell(page, 10).click();
  await expect(cell(page, 10)).toHaveCSS("background-color", SELECTED_BG);
  await expect(cell(page, 0)).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await clearSelection(page);
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

test("right-click erases the answer before restoring its hidden pencil marks", async ({ page }) => {
  await cell(page, 0).click();
  await pencil(page, 0, 2).click();
  await expect(pencil(page, 0, 2)).toHaveClass(/invisible/);
  await page.keyboard.press("4");
  await cell(page, 0).click({ button: "right" });
  await expectValue(page, 0, 0);
  await expect(pencil(page, 0, 2)).toHaveClass(/invisible/);
  await cell(page, 0).click({ button: "right" });
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

test("Shift-hover cursor, box and click target stay one derived slot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const shiftClick = async () => {
    await page.mouse.down();
    await page.mouse.up();
  };

  await moveToPencil(page, 0, 2);
  await expectShiftAgreement(page, null);

  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  await moveToPencil(page, 0, 3);
  await expectShiftAgreement(page, { cell: 0, d: 3 });
  await moveToPencil(page, 0, 4);
  await expectShiftAgreement(page, { cell: 0, d: 4 });

  await moveToPencil(page, 0, 1); // empty slot in the same cell
  await expectShiftAgreement(page, null, { overBoard: true });
  await shiftClick();
  await expectValue(page, 0, 0);

  await moveToCell(page, 1); // given 5
  await expectShiftAgreement(page, null, { overBoard: true });

  await page.keyboard.up("Shift");
  await cell(page, 0).click();
  await page.keyboard.press("5"); // conflict with the given 5
  await expect(cell(page, 0)).toHaveClass(/conflict/);
  await expect(cell(page, 1)).toHaveClass(/conflict/);
  await moveToCell(page, 0);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, null, { overBoard: true });
  await moveToCell(page, 1);
  await expectShiftAgreement(page, null, { overBoard: true });

  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+z"); // empty cell 0 again
  await expectValue(page, 0, 0);
  await cell(page, 0).click(); // selected empty
  await moveToPencil(page, 0, 6);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 6 });

  await page.keyboard.up("Shift");
  await expectShiftAgreement(page, null);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: 0, d: 6 });

  await shiftClick();
  await expectValue(page, 0, 6);
  await page.keyboard.up("Shift");

  // Yellow match chip keeps its fill under the ink aim box.
  await page.keyboard.press("Control+z");
  await expectValue(page, 0, 0);
  await cell(page, 1).click(); // given 5 — same-digit chips
  const match = page.locator(".pencil-box.matching-number").first();
  await expect(match).toBeVisible();
  const chip = await match.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      cell: Number(el.closest(".cell")?.dataset.i),
      d: Number(el.dataset.d),
      w: r.width,
      h: r.height,
      weight: cs.fontWeight,
    };
  });
  expect(chip.weight).toBe("400");
  await dispatchPointerMove(page, chip.x, chip.y);
  await page.keyboard.down("Shift");
  await expectShiftAgreement(page, { cell: chip.cell, d: chip.d });
  const aimed = await page.locator(".pencil-box.aim").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { w: r.width, h: r.height, weight: cs.fontWeight };
  });
  expect(aimed.weight).toBe("400");
  expect(aimed.w).toBeCloseTo(chip.w, 5);
  expect(aimed.h).toBeCloseTo(chip.h, 5);
  await page.keyboard.up("Shift");
});

test("Shift-hover re-resolves when the board changes under a still pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const typeDigit = async (d) => {
    await page.evaluate((key) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: true, bubbles: true }));
    }, String(d));
  };
  const shiftClick = async () => {
    await page.mouse.down();
    await page.mouse.up();
  };
  const tapTool = async (id) => {
    await page.evaluate((id) => document.getElementById(id)?.click(), id);
  };
  const hoverNote2 = async () => {
    await moveToPencil(page, 0, 2);
    await page.keyboard.down("Shift");
    await expectShiftAgreement(page, { cell: 0, d: 2 });
  };

  // Peer fill removes the hovered note (repro: select 2, hover note 2 in 0, type 2).
  await cell(page, 2).click();
  await hoverNote2();
  await typeDigit(2);
  await expectValue(page, 2, 2);
  await expect(cell(page, 0)).not.toHaveAttribute("data-notes", /2/);
  await expectShiftAgreement(page, null, { overBoard: true });
  await shiftClick();
  await expectValue(page, 0, 0);

  // Undo restores the note; hover returns without moving the mouse.
  await tapTool("undo");
  await expectValue(page, 2, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", /2/);
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  await page.keyboard.up("Shift");

  // Erase of the selected peer restores the note under a still hover.
  await cell(page, 2).click();
  await hoverNote2();
  await typeDigit(2);
  await expectValue(page, 2, 2);
  await expectShiftAgreement(page, null, { overBoard: true });
  await tapTool("erase");
  await expectValue(page, 2, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", /2/);
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  // Auto → Manual clears notes; Auto restores them.
  await switchNotesMode(page);
  await expect(
    page.getByRole("button", { name: "Notes mode: Manual" }).filter({ visible: true })
  ).toHaveAttribute("aria-expanded", "false");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  await expectShiftAgreement(page, null, { overBoard: true });
  await shiftClick();
  await expectValue(page, 0, 0);
  await switchNotesMode(page);
  await expect(
    page.getByRole("button", { name: "Notes mode: Auto" }).filter({ visible: true })
  ).toHaveAttribute("aria-expanded", "false");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", /2/);
  await expectShiftAgreement(page, { cell: 0, d: 2 });

  await page.keyboard.up("Shift");

  // A keyboard digit into the hovered cell fills it; hover drops.
  await cell(page, 0).click();
  await hoverNote2();
  await typeDigit(4);
  await expectValue(page, 0, 4);
  await expectShiftAgreement(page, null, { overBoard: true });
  await shiftClick();
  await expectValue(page, 0, 4);
  await page.keyboard.up("Shift");
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
