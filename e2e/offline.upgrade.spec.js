import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { cell, expectValue, DEMO_PUZZLE } from "./helpers.js";
const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer();
    await use(server);
    await server.close();
  },
});
const start = (page) => page.getByRole("button", { name: /^(Play|Start puzzle)$/, exact: true });
const notice = (page) => page.locator(".update-notice.active");
async function check(page) {
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now() + 60_000)));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
}
test("first visit blocks play until complete; a failed bank download has a working retry", async ({
  page,
  deployment,
}) => {
  deployment.fault("bank-delay");
  await page.goto(deployment.url);
  await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  deployment.fault("bank-corrupt");
  await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  deployment.fault("");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(start(page)).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(
    `${deployment.url}sw.js`
  );
  expect(
    await page.evaluate(() => Object.keys(globalThis.__sudokuPuzzleBank).length)
  ).toBeGreaterThan(400);
});
test("second launch and an app-only update reuse the bank, and activate fully offline", async ({
  page,
  context,
  deployment,
}) => {
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await start(page).click();
  const banks = () => deployment.requests.filter((url) => url.includes("/banks/"));
  expect(banks()).toHaveLength(1);
  await page.reload();
  await start(page).click();
  expect(banks()).toHaveLength(1);
  deployment.publish();
  await check(page);
  await expect(notice(page)).toBeVisible();
  expect(banks()).toHaveLength(1);
  await context.setOffline(true);
  await notice(page).getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "new");
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
});

for (const fault of ["bank-corrupt", "bank-interrupted", "manifest-change"]) {
  test(`a ${fault} update preserves the complete old bank and offline shell`, async ({
    page,
    context,
    deployment,
  }) => {
    await page.goto(deployment.url);
    await start(page).click();
    const oldBank = await page.evaluate(() => globalThis.__sudokuPuzzleBank);
    deployment.publish("next");
    deployment.fault(fault);
    await check(page);
    await expect
      .poll(() => deployment.requests.filter((url) => url.includes("/banks/")).length)
      .toBeGreaterThan(1);
    await page.waitForTimeout(300);
    await expect(notice(page)).toHaveCount(0);
    await context.setOffline(true);
    await page.reload();
    await start(page).click();
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank)).toEqual(oldBank);
    await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "old");
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await context.setOffline(false);
    deployment.fault("");
    await check(page);
    await expect(notice(page)).toBeVisible();
    await context.setOffline(true);
    await notice(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
    await expect(start(page)).toBeVisible();
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeTruthy();
  });
}

test("new shell and complete bank activate together while an old tab keeps its assets and cannot save stale progress", async ({
  page,
  context,
  deployment,
}) => {
  const url = `${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`;
  await page.goto(url);
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  const oldPage = await context.newPage();
  await oldPage.goto(url);
  await start(oldPage).click();
  await expectValue(oldPage, 0, 4);
  deployment.publish("next");
  await check(page);
  await expect(notice(page)).toBeVisible();
  const oldAssets = await oldPage.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href)
  );
  await context.setOffline(true);
  await notice(page).getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
  await start(page).click();
  await expectValue(page, 0, 4);
  await cell(page, 0).click();
  await page.keyboard.press("2");
  await expectValue(page, 0, 2);
  const saved = await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"));
  await cell(oldPage, 0).click();
  await oldPage.keyboard.press("3");
  await expectValue(oldPage, 0, 3);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"))).toBe(saved);
  expect(
    await oldPage.evaluate(
      async (assets) => Promise.all(assets.map(async (url) => (await fetch(url)).ok)),
      oldAssets
    )
  ).toEqual(oldAssets.map(() => true));
  expect(await oldPage.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeUndefined();
  expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeTruthy();
  await page.reload();
  await start(page).click();
  await expectValue(page, 0, 2);
});
