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
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
const notice = (page) => page.locator(".update-notice.active");
const build = (page) => page.locator('meta[name="sudoku-build"]');

async function open(page, deployment) {
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem("sudoku-cue", "0");
  });
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Play", exact: true }).tap();
  await expect(cell(page, 0)).toBeVisible();
  await cell(page, 0).tap();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await expect(build(page)).toHaveAttribute("content", "old");
}
async function check(page) {
  // Real lifecycle listeners; a short absence skips the automatic reveal.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function publish(page, deployment) {
  // Advance only wall time, leaving animation and timer scheduling real.
  await page.clock.setSystemTime(new Date(Date.now() + 60_000));
  deployment.publish();
  await check(page);
  await expect(notice(page)).toHaveCSS("opacity", "1");
}
test("a three-second version request never blocks the board", async ({ page, deployment }) => {
  let completed = false;
  await page.route("**/version.json?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    completed = true;
    await route.continue().catch(() => {});
  });
  await page.addInitScript(() => {
    const fetcher = window.fetch;
    window.fetch = (...args) => {
      if (String(args[0]).includes("version.json")) window.versionStarted = performance.now();
      return fetcher(...args);
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector("#app")?.childElementCount) {
        window.uiMounted = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(cell(page, 0)).toBeVisible();
  // Measure inside the document, excluding test-runner and interaction latency.
  expect(await page.evaluate(() => window.uiMounted - window.versionStarted)).toBeLessThan(500);
  expect(completed).toBe(false);
});

test("notice persists for 60 seconds; dismissal dedupes the same version", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await publish(page, deployment);
  await expect(page.locator(".update-live")).toHaveText("New version ready. Update available.");
  await page.clock.install();
  await page.clock.fastForward(60_000);
  await expect(notice(page)).toBeVisible();
  // The body of the notice is not a dismiss target.
  await notice(page).locator(".msg").tap();
  await expect(notice(page)).toBeVisible();
  await notice(page).getByRole("button", { name: "Dismiss", exact: true }).tap();
  await expect(notice(page)).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await check(page);
  await page.clock.runFor(600);
  await expect(notice(page)).toHaveCount(0);
  await expect(build(page)).toHaveAttribute("content", "old");
});

test("failed Update restores the buttons after three seconds", async ({ page, deployment }) => {
  await open(page, deployment);
  await publish(page, deployment);
  await page.route("**/*", (route) =>
    route.request().isNavigationRequest() ? route.abort("aborted") : route.continue()
  );
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 65_000));
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(notice(page)).toHaveAttribute("aria-busy", "true");
  await expect(notice(page)).toHaveText("Updating…");
  await page.clock.fastForward(2999);
  await expect(notice(page)).toHaveAttribute("aria-busy", "true");
  await page.clock.fastForward(1);
  await expect(notice(page).getByRole("button", { name: "Update", exact: true })).toBeVisible();
});

test("new notice waits until automatic resume reveal finishes", async ({ page, deployment }) => {
  await open(page, deployment);
  await page.clock.setSystemTime(new Date(Date.now() + 60_000));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.setSystemTime(new Date(Date.now() + 62_000));
  deployment.publish();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "reveal");
  await expect(notice(page)).toHaveCount(0);
  await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
  await expect(notice(page)).toHaveCSS("opacity", "1");
});

for (const view of ["Play", "Journal"]) {
  test(`${view}: approved geometry, hit areas, pressed paint, keyboard focus and reduced motion`, async ({
    page,
    deployment,
  }) => {
    await open(page, deployment);
    if (view === "Journal") await page.getByRole("button", { name: /Open Journal/ }).tap();
    const geometry = async () =>
      page
        .locator(".board, .hint-line, .keypad")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    const before = await geometry();
    await publish(page, deployment);
    expect(await geometry()).toEqual(before);
    const n = notice(page);
    const rect = await n.boundingBox();
    if (view === "Journal") {
      expect(rect.height).toBe(44);
      expect(rect.x + rect.width / 2).toBeCloseTo(195, 0);
    } else {
      await expect(n).toHaveCSS("transition-duration", "0.18s");
      await expect(n).toHaveCSS("transition-delay", "0.18s");
    }
    const hits = await n.locator("button").evaluateAll((buttons) =>
      buttons.map((btn) => {
        const r = btn.getBoundingClientRect(),
          c = getComputedStyle(btn),
          a = getComputedStyle(btn, "::after");
        return {
          left: r.left + parseFloat(c.borderLeftWidth) + parseFloat(a.left),
          right: r.right - parseFloat(c.borderRightWidth) - parseFloat(a.right),
          top: r.top + parseFloat(c.borderTopWidth) + parseFloat(a.top),
          bottom: r.bottom - parseFloat(c.borderBottomWidth) - parseFloat(a.bottom),
        };
      })
    );
    for (const hit of hits) {
      expect(hit.bottom - hit.top).toBeGreaterThanOrEqual(44);
      expect(hit.right - hit.left).toBeGreaterThanOrEqual(44);
    }
    expect(hits[0].right).toBeCloseTo(hits[1].left, 1);
    if (view === "Play") {
      const key = await page.locator(".keypad").boundingBox();
      expect(hits[0].top).toBeGreaterThanOrEqual(key.y + key.height - 0.1);
    }
    const update = n.getByRole("button", { name: "Update", exact: true });
    const box = await update.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(update).toHaveCSS("background-color", "rgb(211, 224, 248)");
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await page.keyboard.press("Tab");
    await update.focus();
    await expect(update).toHaveCSS("outline-width", "2px");
    const dismiss = n.getByRole("button", { name: "Dismiss", exact: true });
    await dismiss.focus();
    await expect(dismiss).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Enter");
    await expect(notice(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".update-notice")).toHaveCSS("transition-duration", "0s");
  });
}

test("responsive notice removal restores keyboard focus to More", async ({ page, deployment }) => {
  await open(page, deployment);
  await publish(page, deployment);
  await page.keyboard.press("Tab");
  await notice(page).getByRole("button", { name: "Update", exact: true }).focus();
  await expect(notice(page).getByRole("button", { name: "Update", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 640, height: 844 });
  await expect(page.locator("[data-more]:visible")).toBeFocused();
});

test("a missing module still offers Reload Sudoku and recovers on the next launch", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await publish(page, deployment);
  deployment.fault("missing-asset");
  await page.route("**/*", (route) => route.continue());
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  const retry = page.getByRole("link", { name: "Reload Sudoku" });
  await expect(retry).toBeVisible();
  expect(page.url()).not.toContain("_sudoku_update");
  deployment.fault("");
  await retry.click();
  await expect(build(page)).toHaveAttribute("content", "new");
  await page.getByRole("button", { name: "Play", exact: true }).tap();
  await expect(cell(page, 0)).toBeVisible();
  await expectValue(page, 0, 0);
});

for (const fault of ["offline", "version-error", "timeout", "old-html"]) {
  test(`background check keeps the board usable on ${fault}`, async ({ page, deployment }) => {
    deployment.publish();
    deployment.launchOld();
    deployment.fault(fault);
    await open(page, deployment);
    await expect(notice(page)).toHaveCount(0);
    expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(0);
  });
}
