import { test, expect, chromium, webkit } from "@playwright/test";
import { DEMO_PUZZLE, cell, expectValue, resumeFromHome } from "./helpers.js";

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
  const catalog = await page.evaluate(async () => {
    const descriptor = globalThis.__sudokuBankCatalog;
    const cache = await caches.open(`sudoku-offline-v1:/sudoku/:release:${descriptor.version}`);
    const response = await cache.match(new URL(descriptor.path, location.href));
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    return { descriptor, digest, data: JSON.parse(new TextDecoder().decode(bytes)) };
  });
  expect(catalog.digest).toBe(catalog.descriptor.hash);
  expect(catalog.data.puzzles).toHaveLength(4000);
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
  await resumeFromHome(restarted);
  await expectValue(restarted, 0, 4);
  expect(new URL(restarted.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(restarted.url()).hash).toBe("#board");
  expect(await restarted.evaluate(() => globalThis.__sudokuPuzzleBank)).toEqual(bank);
  expect(await restarted.evaluate(() => globalThis.__sudokuBankCatalog)).toEqual(
    catalog.descriptor
  );
  expect(
    await restarted.evaluate(async () =>
      (await fetch(new URL(globalThis.__sudokuBankCatalog.path, location.href))).json()
    )
  ).toEqual(catalog.data);
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
  const launchOptions = testInfo.project.use.launchOptions;
  let context = await browserType.launchPersistentContext(profile, {
    ...launchOptions,
    headless: true,
  });
  try {
    let page = await context.newPage();
    const url = `${baseURL}?q=${DEMO_PUZZLE}`;
    await page.goto(url);
    await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await expectValue(page, 0, 4);
    await context.close();
    context = await browserType.launchPersistentContext(profile, {
      ...launchOptions,
      headless: true,
      offline: true,
    });
    page = await context.newPage();
    await page.goto(url);
    await resumeFromHome(page);
    await expectValue(page, 0, 4);
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain(
      "/sudoku/sw.js"
    );
  } finally {
    await context.close();
  }
});

test("bank slots resume and new personalized puzzles start fully offline", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: /^Easy / }).click();
  const blank = page.locator(".board > .cell:not(.given)").first();
  const id = await blank.getAttribute("data-i");
  await blank.click();
  await page.keyboard.press("1");
  await expect(blank).toHaveAttribute("data-value", "1");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sudoku", exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await resumeFromHome(page);
  await expect(page.locator(`.cell[data-i="${id}"]`)).toHaveAttribute("data-value", "1");
  await expect(page.locator(".header .t1")).toHaveText("Easy");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator(".bank-pages .back").click();
  await page.getByRole("button", { name: /^Easy / }).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("button", { name: /Unfinished/ })).toContainText("2");
});
