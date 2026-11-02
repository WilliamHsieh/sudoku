import { expect } from "@playwright/test";
import { prepareSolved } from "./solved-fixture.js";
import { puzzleData } from "../src/puzzles.js";
import { solve } from "./helpers.js";

export async function prepareResume(page, previousYear = false) {
  const date = previousYear ? "2026-11-01" : "2025-12-29";
  await page.clock.setFixedTime(new Date(`${date}T12:00:00`));
  const remaining = await prepareSolved(page, { date, lastToday: true, resumeDate: "2025-12-28" });
  const last = remaining.at(-1);
  await page.locator(`.cell[data-i="${last}"]`).click();
  await page.keyboard.press(solve(puzzleData[date].easy)[last]);
  await expect(page.locator("#sv-h")).toBeFocused();
  await page
    .locator(".sv-panel")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return `Resume Dec 28${previousYear ? ", 2025" : ""} · Medium`;
}
