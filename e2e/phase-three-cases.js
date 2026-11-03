import { expect } from "@playwright/test";
import corpus from "../src/hints/fixtures/phase-three-corpus.json" with { type: "json" };
import { legalMasks } from "../src/hints/proof-verifier.js";
import { maskDigits } from "../src/game/board.js";
import { cell, openBoard } from "./helpers.js";

export const phaseThreeCases = [
  { fixture: "WXYZ_WING", technique: "XY-Chain", id: "xy-chain", width: 1280 },
  {
    fixture: "GROUPED_X_CYCLES",
    technique: "Rectangle Elimination",
    id: "rectangle-elimination",
    width: 390,
  },
  {
    fixture: "ALS_XY_WING",
    technique: "Grouped X-Cycles",
    id: "grouped-x-cycles",
    width: 1280,
  },
  { fixture: "AIC", technique: "交替推理鏈（AIC）", id: "aic", width: 1280 },
  { fixture: "DEATH_BLOSSOM", technique: "Death Blossom", id: "death-blossom", width: 390 },
  {
    fixture: "ALIGNED_PAIR_EXCLUSION",
    technique: "Aligned Pair Exclusion",
    id: "aligned-pair-exclusion",
    width: 1280,
  },
];

/** Genuine progressed values become a custom board. Reproduce its archived
 * candidate assumptions through normal note controls, not an injected state,
 * a fixture hint provider, a Worker replacement, or a precomputed answer.
 */
export async function openPhaseThreeCase(page, example) {
  const fixture = corpus.fixtures.find((f) => f.id === `upstream-example:${example.fixture}`);
  if (!fixture) throw new Error(`Missing phase-three example ${example.fixture}`);
  await page.setViewportSize({ width: example.width, height: 844 });
  await openBoard(page, `./?q=${fixture.values}`);
  const mode = page.getByRole("button", { name: /^Notes mode:/ }).filter({ visible: true });
  await expect(mode).toHaveAccessibleName("Notes mode: Auto");
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
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
  }
  await page.keyboard.press("Escape");
  for (let index = 0; index < 81; index++)
    await expect(cell(page, index)).toHaveAttribute(
      "data-notes",
      maskDigits(fixture.masks[index]).join("")
    );
  return fixture;
}
