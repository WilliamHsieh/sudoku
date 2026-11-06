import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import buildUpgrades from "../e2e/upgrade-builds.js";
import { upgradeServer } from "../e2e/upgrade-server.js";
import { DEMO_PUZZLE, cell, expectValue } from "../e2e/helpers.js";

const output =
  process.env.SUDOKU_OFFLINE_EVIDENCE || "/home/william/research/sudoku-offline-evidence";
await mkdir(output, { recursive: true });
await buildUpgrades();
const deployment = await upgradeServer();
const profile = await mkdtemp(join(tmpdir(), "sudoku-offline-evidence-"));
const options = {
  headless: true,
  viewport: { width: 1024, height: 900 },
  colorScheme: "light",
  recordVideo: { dir: output, size: { width: 1024, height: 900 } },
};
let context;
const videos = [];
const shots = [];
const start = (page) => page.getByRole("button", { name: "Start puzzle", exact: true });
async function caption(page, text) {
  await page.evaluate((text) => {
    let node = document.getElementById("evidence-caption");
    if (!node) {
      node = document.createElement("div");
      node.id = "evidence-caption";
      node.style.cssText =
        "position:fixed;top:4px;left:22%;right:22%;z-index:10000;background:#172b41;color:white;padding:10px 14px;border-radius:8px;font:15px/1.4 system-ui;text-align:center;pointer-events:none";
      document.body.append(node);
    }
    node.textContent = text;
  }, text);
}
async function shot(page, name) {
  const path = join(output, name + ".png");
  await page.screenshot({ path });
  shots.push(path);
}
try {
  const release = deployment.holdBank();
  deployment.fault("bank-corrupt");
  context = await chromium.launchPersistentContext(profile, options);
  await context.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
  let page = context.pages()[0];
  const url = `${deployment.url}?q=${DEMO_PUZZLE}&keep=evidence#board`;
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
  await caption(page, "First visit: preparing the complete puzzle bank and offline shell");
  await page.waitForTimeout(3000);
  await shot(page, "01-first-loading");
  release();
  await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
  await caption(page, "A corrupt download is rejected. Retry is visible; play stays blocked.");
  await shot(page, "02-download-failure");
  await page.waitForTimeout(4000);
  deployment.fault("");
  await caption(page, "Connection restored. Retry downloads and verifies the full release.");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(start(page)).toBeVisible();
  await page.waitForTimeout(3500);
  await start(page).click();
  await caption(page, "Ready to play. This custom puzzle will keep its progress offline.");
  await page.waitForTimeout(3000);
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await page.waitForTimeout(3500);
  await shot(page, "03-saved-custom-progress");
  await context.setOffline(true);
  await caption(page, "Network disabled. Reloading from the verified local release.");
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(start(page)).toBeVisible();
  await page.waitForTimeout(3000);
  await start(page).click();
  await expectValue(page, 0, 4);
  await caption(page, "Offline reload: the saved answer is still here.");
  await shot(page, "04-offline-reload");
  await page.waitForTimeout(4000);
  const firstVideo = page.video();
  await context.close();
  videos.push(await firstVideo.path());
  context = await chromium.launchPersistentContext(profile, { ...options, offline: true });
  page = context.pages()[0];
  await page.goto(url);
  await expect(start(page)).toBeVisible();
  await caption(page, "Browser closed and restarted with the network still disabled.");
  await page.waitForTimeout(3000);
  await start(page).click();
  await expectValue(page, 0, 4);
  await caption(page, "Offline browser restart: the complete bank and saved game are available.");
  await shot(page, "05-offline-browser-restart");
  await page.waitForTimeout(4000);
  await context.setOffline(false);
  await caption(page, "Back online. A new shell and changed complete bank are published.");
  await page.waitForTimeout(2500);
  deployment.publish("next");
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now() + 60_000)));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  const notice = page.locator(".update-notice.active");
  await expect(notice).toBeVisible();
  await caption(page, "New version ready: the entire new release has passed verification.");
  await shot(page, "06-update-ready-progress-intact");
  await page.waitForTimeout(4000);
  await context.setOffline(true);
  await caption(
    page,
    "Network disabled again. Update saves progress, then activates the ready release."
  );
  await page.waitForTimeout(2500);
  await notice.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
  await expect(start(page)).toBeVisible();
  await page.waitForTimeout(3000);
  await start(page).click();
  await expectValue(page, 0, 4);
  expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeTruthy();
  await caption(
    page,
    "Updated offline: new shell + complete bank, same custom link and saved answer."
  );
  await shot(page, "07-updated-progress-survives");
  await page.waitForTimeout(4000);
  const secondVideo = page.video();
  await context.close();
  videos.push(await secondVideo.path());
  await writeFile(
    join(output, "media.json"),
    JSON.stringify(
      {
        codeHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        browser: "Playwright Chromium",
        physicalIPhone: false,
        pace: "1x; 2.5–3 seconds before actions, 3.5–4 seconds after results",
        videos,
        shots,
      },
      null,
      2
    )
  );
} finally {
  await context?.close();
  await deployment.close();
}
