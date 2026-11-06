import { test, expect, chromium, webkit } from "@playwright/test";
import { DEMO_PUZZLE, cell, expectValue } from "./helpers.js";

test("a verified complete bank supports offline reload and a new page", async ({
  page,
  context,
}) => {
  await page.goto(`?q=${DEMO_PUZZLE}&keep=yes#board`);
  await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
    .toContain("/sudoku/sw.js");
  const bank = await page.evaluate(() => globalThis.__sudokuPuzzleBank);
  expect(Object.keys(bank).length).toBeGreaterThan(400);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  const url = page.url();
  await page.close();
  const restarted = await context.newPage();
  await restarted.goto(url);
  await restarted.getByRole("button", { name: "Start puzzle", exact: true }).click();
  await expectValue(restarted, 0, 4);
  expect(new URL(restarted.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(restarted.url()).hash).toBe("#board");
  expect(await restarted.evaluate(() => globalThis.__sudokuPuzzleBank)).toEqual(bank);
  const [worker] = await Promise.all([
    restarted.waitForEvent("worker"),
    restarted.locator("#hint-trigger").click(),
  ]);
  expect(worker.url()).toContain("engine.worker");
  await expect(restarted.locator("#hint-panel .hint-position")).toHaveText("1/3");
});

test("a closed browser restarts offline with the complete release and saved custom game", async ({
  browserName,
  baseURL,
}, testInfo) => {
  const browserType = browserName === "webkit" ? webkit : chromium;
  const profile = testInfo.outputPath("offline-profile");
  let context = await browserType.launchPersistentContext(profile, { headless: true });
  try {
    let page = await context.newPage();
    const url = `${baseURL}?q=${DEMO_PUZZLE}`;
    await page.goto(url);
    await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await expectValue(page, 0, 4);
    await context.close();
    context = await browserType.launchPersistentContext(profile, { headless: true, offline: true });
    page = await context.newPage();
    await page.goto(url);
    await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
    await expectValue(page, 0, 4);
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain(
      "/sudoku/sw.js"
    );
  } finally {
    await context.close();
  }
});
