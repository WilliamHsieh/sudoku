// Capture-only branch. Source app and real Worker are identical to PR #86.
import { test, expect } from "@playwright/test";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
const cases = JSON.parse(
  readFileSync(new URL("./hint-recording-cases.json", import.meta.url), "utf8")
);
import { newGame } from "../src/game/game.js";

const pairPuzzle =
  "519876342642000897378924165164537928295481673783692451937040006806009704401760009";
const demoPuzzle =
  "050900000800040307000280190538607940020301000109804623907400000045000209000030070";
const modeControl = (page) =>
  page.getByRole("button", { name: /^Notes mode:/ }).filter({ visible: true });
async function chooseMode(page, mode) {
  await modeControl(page).click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${mode} `) }).click();
  await expect(modeControl(page)).toHaveAccessibleName(`Notes mode: ${mode}`);
  await expect(modeControl(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
  await page.waitForTimeout(700);
}
async function openPrepared(page, state) {
  const server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer.address();
  await page.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
  await page.goto(`http://127.0.0.1:${address.port}/sudoku/`);
  await page.evaluate(async (prepared) => {
    const { game } = await import("/sudoku/src/game/game.svelte.js");
    const { timer, timerRunning } = await import("/sudoku/src/store.js");
    game.load(prepared.givens.join(""));
    game.commitStroke(prepared);
    game.discardHistory();
    timer.set(767);
    timerRunning.set(false);
    window.dispatchEvent(new CustomEvent("loadPuzzle"));
  }, state);
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await page
    .locator(".play")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.waitForTimeout(1100);
  return server;
}
async function reveal(page, technique) {
  const worker = page.waitForEvent("worker");
  await page.locator("#hint-trigger").click();
  expect((await worker).url()).toMatch(/engine\.worker/);
  const panel = page.locator("#hint-panel");
  await expect(panel.locator(".hint-position")).toHaveText("1/3");
  await page.waitForTimeout(1500);
  await panel.locator('[data-action="next"]').click();
  await expect(panel.locator(".technique")).toHaveText(technique);
  await page.waitForTimeout(2100);
  await panel.locator('[data-action="next"]').click();
  await page.waitForTimeout(1800);
  return panel;
}

export function registerHintCaptures(scenarios) {
  for (const scenario of scenarios) {
    test.describe(scenario.name, () => {
      test.use({
        viewport: { width: scenario.width, height: scenario.height },
        hasTouch: scenario.width < 600,
        isMobile: scenario.width < 600,
        deviceScaleFactor: 1,
        colorScheme: "light",
      });
      test(scenario.name, async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        let state = newGame(pairPuzzle, { notesMode: "auto" });
        if (scenario.name.includes("x-wing-desktop")) state = cases["x-wing"];
        if (scenario.name.startsWith("tidy")) {
          state = newGame(pairPuzzle, { notesMode: "tidy" });
          state.manualNotes[77] = 1 << 5;
        }
        if (scenario.name.startsWith("manual"))
          state = newGame(demoPuzzle, { notesMode: "manual" });
        const server = await openPrepared(page, state);
        try {
          if (scenario.name.startsWith("manual")) {
            await expect(page.locator("#hint-trigger")).toHaveCount(0);
            await page.waitForTimeout(1800);
            await chooseMode(page, "Tidy");
            const panel = await reveal(page, "顯性單數");
            await panel.locator('[data-action="apply"]').click();
            await page.waitForTimeout(1500);
            await panel.locator('[data-action="undo"]').click();
          } else {
            const technique = scenario.name.includes("x-wing-desktop") ? "X-Wing" : "顯性數對";
            const panel = await reveal(page, technique);
            await panel.locator('[data-action="apply"]').click();
            await expect(panel).toContainText("這一步已完成");
            await page.waitForTimeout(1700);
            if (scenario.name.startsWith("auto-naked")) {
              await panel.getByRole("button", { name: "收起提示" }).click();
              const next = await reveal(page, "XY-Wing");
              await next.getByRole("button", { name: "我自己試試" }).click();
            } else {
              await panel.locator('[data-action="undo"]').click();
            }
          }
          await page.waitForTimeout(1000);
          await testInfo.attach("final-frame", {
            body: await page.screenshot(),
            contentType: "image/png",
          });
        } finally {
          await server.close();
        }
      });
    });
  }
}
