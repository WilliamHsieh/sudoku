import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { cell, expectValue } from "./helpers.js";

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer();
    server.publish("legacy");
    await use(server);
    await server.close();
  },
});

test("deployed schema-1 app updates to the bank Home without migrating legacy saves", async ({
  page,
  context,
  deployment,
}) => {
  await page.clock.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  await page.goto(`${deployment.url}?keep=yes#board`);
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "legacy");
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  const answer = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  expect(answer).toBeGreaterThanOrEqual(0);
  await cell(page, answer).click();
  await page.keyboard.press("1");
  await expectValue(page, answer, 1);
  const probes = () => deployment.requests.filter((url) => url.includes("version.json"));
  await expect.poll(() => probes().length).toBe(1);
  deployment.requests.length = 0;
  deployment.publish();
  await page.clock.setSystemTime(new Date("2026-10-23T12:01:00Z"));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  const notice = page.locator(".update-notice.active");
  // The unmodified deployed updater verifies HTML and JS/CSS under its own
  // 1500 ms deadline. A schema rejection or timeout cannot show this notice.
  await expect(notice).toBeVisible();
  expect(probes()).toHaveLength(2);
  expect(probes().every((url) => url.includes("_sudoku_check="))).toBe(true);
  expect(
    deployment.requests.some((url) => url.startsWith("/sudoku/index.html?_sudoku_check="))
  ).toBe(true);
  expect(deployment.requests.some((url) => /\/assets\/.*\.js$/.test(url))).toBe(true);
  expect(deployment.requests.some((url) => /\/assets\/.*\.css$/.test(url))).toBe(true);
  const release = deployment.holdBank();
  await notice.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem("sudoku-progress"));
  expect(JSON.parse(saved)["2026-10-22"].easy.snapshot.answers[answer]).toBe("1");
  release();
  const play = page.getByRole("button", { name: /^Easy / });
  await expect(play).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe(saved);
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(
    `${deployment.url}sw.js`
  );
  expect(
    await page.evaluate(() => Object.keys(globalThis.__sudokuPuzzleBank).length)
  ).toBeGreaterThan(400);
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "new");
  await context.setOffline(true);
  await page.reload();
  await play.click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe(saved);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
  await page.screenshot({ path: test.info().outputPath("legacy-migrated-offline.png") });
});
