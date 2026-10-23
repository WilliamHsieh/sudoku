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
const build = (page) => page.locator('meta[name="sudoku-build"]');
const live = (page) => page.locator(".update-live");
const notice = (page) => live(page).getByRole("status").filter({ hasText: "Update ready" });
const attempts = (deployment) => deployment.requests.filter((r) => r.includes("_sudoku_update="));

async function open(page, deployment) {
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem("sudoku-cue", "0");
  });
  await page.clock.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(cell(page, 0)).toBeVisible();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.evaluate(() => {
    window.upgradeDocument = true;
  });
}

// Drive the actual visibility handlers, as in the #43 regression tests. Only
// visibility and elapsed wall time are controlled; resume timers/animations run.
async function hide(page, away = 2000) {
  await page.evaluate((away) => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.upgradeReturnTime = Date.now() + away;
  }, away);
}
async function foreground(page) {
  const time = await page.evaluate(() => window.upgradeReturnTime);
  await page.clock.setSystemTime(new Date(time));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function expectSameDocument(page) {
  expect(await page.evaluate(() => window.upgradeDocument)).toBe(true);
  await expect(build(page)).toHaveAttribute("content", "old");
}

test("cold launch reloads exactly once, preserves URL and saved daily board/time", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  const index = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  await expect(page.getByRole("timer")).not.toHaveText(/0:00$/);
  await cell(page, index).click();
  await page.keyboard.press("1");
  await expectValue(page, index, 1);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem("sudoku-progress"));
  const entry = JSON.parse(saved)["2026-10-22"].easy;
  expect(entry.elapsed).toBeGreaterThan(0);
  deployment.publish();
  deployment.launchOld();
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe(DEMO_PUZZLE);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
  expect(page.url()).not.toContain("_sudoku_update");
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe(saved);
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  await expectValue(page, index, 1);
  const elapsed = await page.locator("[data-time]").evaluate((el) => {
    const [minutes, seconds] = el.textContent.split(":").map(Number);
    return minutes * 60 + seconds;
  });
  expect(elapsed).toBeGreaterThanOrEqual(entry.elapsed);
  expect(elapsed).toBeLessThan(entry.elapsed + 3);
  expect(attempts(deployment)).toHaveLength(1);
});

test("foreground shows a quiet notice without reloading; #43 resumes and input works", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  // The live region is mounted before the notice so the insertion is announced.
  await expect(live(page)).toBeEmpty();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await hide(page);
  await expect(page.locator(".play")).toHaveAttribute("data-pause-reason", "auto");
  deployment.publish();
  await foreground(page);
  await expect(notice(page)).toBeVisible();
  await expect(live(page)).toHaveAttribute("aria-live", "polite");
  await expect(live(page)).toHaveText("Update ready — applies next launch");
  await expectSameDocument(page);
  await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expectValue(page, 0, 4);
  await cell(page, 2).click();
  await page.keyboard.press("1");
  await expectValue(page, 2, 1);
  expect(attempts(deployment)).toHaveLength(0);
  await page.waitForTimeout(6100);
  await hide(page, 60_000);
  await foreground(page);
  await expect(notice(page)).toHaveCount(0);
  await expectSameDocument(page);
});

test("notice also covers Journal, wraps within the viewport, and does not move focus", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const journal = page.getByRole("button", { name: "Journal", exact: true });
  await journal.click();
  await journal.focus();
  await hide(page);
  deployment.publish();
  await foreground(page);
  await expect(notice(page)).toBeVisible();
  await expect(journal).toBeFocused();
  const box = await notice(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(await notice(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  expect(await notice(page).evaluate((el) => el.getAnimations().length)).toBe(0);
  await expectSameDocument(page);
});

for (const fault of ["offline", "version-error", "timeout", "old-html"]) {
  test(`cold launch remains usable on ${fault}`, async ({ page, deployment }) => {
    deployment.publish();
    deployment.launchOld();
    deployment.fault(fault);
    await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    if (fault === "timeout") await expect.poll(() => deployment.abortedChecks.length).toBe(1);
    await expect(build(page)).toHaveAttribute("content", "old");
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await expectValue(page, 0, 4);
    expect(attempts(deployment)).toHaveLength(0);
  });
}

test("offline foreground keeps the same document usable", async ({ page, deployment }) => {
  await open(page, deployment);
  await hide(page);
  deployment.publish();
  await page.context().setOffline(true);
  await foreground(page);
  await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
  await expectSameDocument(page);
  await expect(notice(page)).toHaveCount(0);
  await cell(page, 2).click();
  await page.keyboard.press("1");
  await expectValue(page, 2, 1);
});

test("stale navigation makes at most one attempt per tab", async ({ page, deployment }) => {
  deployment.publish();
  deployment.fault("stale-navigation");
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(build(page)).toHaveAttribute("content", "old");
  expect(attempts(deployment)).toHaveLength(1);
  expect(page.url()).not.toContain("_sudoku_update");
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  expect(attempts(deployment)).toHaveLength(1);
});

test("missing module offers a plain reload and the next launch works", async ({
  page,
  deployment,
}) => {
  deployment.publish();
  deployment.launchOld();
  deployment.fault("missing-asset");
  // Routing disables the browser cache, allowing a fault after successful warming.
  await page.route("**/*", (route) => route.continue());
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}#board`);
  const retry = page.getByRole("link", { name: "Reload Sudoku" });
  await expect(retry).toBeVisible();
  expect(page.url()).not.toContain("_sudoku_update");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(attempts(deployment)).toHaveLength(1);
  deployment.fault("");
  await retry.click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(build(page)).toHaveAttribute("content", "new");
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  expect(attempts(deployment)).toHaveLength(1);
});

test("persisted pageshow checks once, ordinary pageshow does not check", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  deployment.publish();
  const before = deployment.requests.filter((r) => r.includes("version.json")).length;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  expect(deployment.requests.filter((r) => r.includes("version.json"))).toHaveLength(before);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  await expect(notice(page)).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  expect(deployment.requests.filter((r) => r.includes("version.json"))).toHaveLength(before + 1);
  await expectSameDocument(page);
});
