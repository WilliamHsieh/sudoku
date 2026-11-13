// Calendar month movement has no replacement. Keep keyboard/focus/navigation invariants.
import { test, expect } from "@playwright/test";
import { seed, openList } from "./bank-fixture.js";
for (const width of [390, 1280])
  for (const reducedMotion of ["reduce", "no-preference"]) {
    test(`home/chooser/list Back restores a labelled focus target (${width}, ${reducedMotion})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ reducedMotion });
      await seed(page);
      await openList(page);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Choose L1–L8" })).toBeFocused();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sudoku" })).toBeFocused();
    });
  }
