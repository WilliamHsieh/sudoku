import { expect } from "@playwright/test";
import fixture from "../src/hints/fixtures/finned-fish.json" with { type: "json" };
import { legalMasks } from "../src/hints/proof-verifier.js";
import { maskDigits } from "../src/game/board.js";
import { cell, openBoard } from "./helpers.js";

// A consistent candidate exercise with a known completion. Recreate its
// assumptions with normal Auto-note controls; use the real hint Worker.
export async function openFishCase(page) {
  await openBoard(page, `./?q=${fixture.values}`);
  const legal = legalMasks([...fixture.values].map(Number));
  for (let digit = 1; digit <= 9; digit++) {
    const removed = legal.flatMap((mask, index) =>
      mask & ~fixture.masks[index] & (1 << digit) ? [index] : []
    );
    if (!removed.length) continue;
    await page.keyboard.press(`Shift+Digit${digit}`);
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", String(digit));
    for (const index of removed) await cell(page, index).click();
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Escape");
  for (let index = 0; index < 81; index++)
    await expect(cell(page, index)).toHaveAttribute(
      "data-notes",
      maskDigits(fixture.masks[index]).join("")
    );
  const [worker] = await Promise.all([
    page.waitForEvent("worker"),
    page.locator("#hint-trigger").click(),
  ]);
  expect(worker.url()).toMatch(/engine\.worker/);
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  return fixture;
}
