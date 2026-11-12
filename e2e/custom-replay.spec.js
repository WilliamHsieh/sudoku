import { test, expect } from "@playwright/test";
import { seed, solved } from "./bank-fixture.js";

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

async function paste(page, digits) {
  await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
  await page.getByRole("button", { name: "Paste puzzle", exact: true }).click();
  await page.getByRole("textbox", { name: "Puzzle link or 81 digits" }).fill(digits);
  await page.getByRole("button", { name: "Start puzzle" }).click();
}

test("first custom solve returns to Custom puzzles without a comparison line", async ({ page }) => {
  await solved(page, { custom: true });
  await expect(page.locator(".header .t1")).toHaveText("Custom 1");
  await expect(page.locator(".sv-last")).toHaveCount(0);
  await page.getByRole("button", { name: "Custom puzzles" }).click();
  await expect(page.getByRole("heading", { name: "Sudoku" })).toBeVisible();
});

for (const [time, line] of [
  [402, "比上次快 1:28"],
  [505, "比上次慢 0:15"],
])
  test(`a custom replay solve compares with the last solve: ${line}`, async ({ page }) => {
    await solved(page, { custom: true, replay: true, time, priorTime: 490 });
    await expect(page.locator(".sv-last")).toHaveText(line);
  });

test("pasting an unfinished custom board resumes that game", async ({ page }) => {
  const data = await seed(page, { custom: true, time: 125 });
  await paste(page, data.puzzle.digits);
  await expect(page.locator(".toast")).toHaveText("這題之前玩過，已幫你接著玩");
  await expect(page.locator(".header .t1")).toHaveText("Custom 1");
  await expect(page.locator("#header-time")).toHaveText("2:05");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /Unfinished/ }).click();
  await expect(page.getByRole("button", { name: /Resume .* · Custom/ })).toHaveCount(1);
});

test("pasting a solved custom board opens its saved solve and replays it", async ({ page }) => {
  const data = await seed(page, { custom: true, complete: true, time: 442, extra: true });
  await paste(page, data.puzzle.digits);
  await expect(page.locator(".toast")).toHaveText("這題之前解過");
  await expect(page.locator(".header .t1")).toHaveText("Custom 1");
  await expect(page.locator(".sv-view-panel .summary")).toHaveText("Custom 1");
  await expect(page.getByRole("button", { name: "Custom puzzles" })).toBeVisible();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("7:22");
  await expect(page.getByRole("alertdialog")).not.toContainText("重玩不計入解鎖進度");
  await page.getByRole("alertdialog").getByRole("button", { name: "Replay" }).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await expect(page.locator(".header .t1")).toHaveText("Custom 1");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await paste(page, data.puzzle.digits);
  await expect(page.getByRole("button", { name: "Resume replay" })).toBeVisible();
  await expect(page.locator(".sv-view-panel .hero")).toHaveText("7:22");
});
