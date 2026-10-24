import { test, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openBoard } from "./helpers.js";

// Exercise the real app with its one policy flag flipped, without editing the
// worktree or adding a runtime product setting. Preview bundles inline constants,
// so this test serves the source app and overrides only the policy module.
let server;
let url;
let cacheDir;
test.beforeAll(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "sudoku-blur-policy-"));
  server = await createServer({ cacheDir, server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  url = server.resolvedUrls.local[0];
});
test.afterAll(async () => {
  await server?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

test("disabling PAUSE_ON_WINDOW_BLUR leaves blur-only absences running; explicit hides still pause", async ({
  page,
}) => {
  let flagOverridden = false;
  await page.route("**/src/play/background-policy.js*", async (route) => {
    flagOverridden = true;
    await route.fulfill({
      contentType: "application/javascript",
      body: "export const PAUSE_ON_WINDOW_BLUR = false;",
    });
  });
  const start = new Date("2026-10-24T12:00:00Z");
  // Leave headroom for the protocol round trip while the installed clock runs.
  await page.clock.install({ time: new Date(start.getTime() - 60_000) });
  await page.clock.pauseAt(start);
  await openBoard(page, url);
  expect(flagOverridden).toBe(true);
  await page.clock.runFor(1_000);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".paused-cover")).toHaveCount(0);
  await expect(page.locator("#time-control")).toHaveAttribute("aria-pressed", "false");
  await page.clock.runFor(2_000);
  await expect(page.locator("[data-time]")).toHaveText("0:03");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");

  for (const signal of ["visibilitychange", "pagehide", "freeze"]) {
    const opacity = await page.evaluate((signal) => {
      if (signal === "visibilitychange") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      }
      const target = signal === "pagehide" ? window : document;
      target.dispatchEvent(new Event(signal));
      return getComputedStyle(document.querySelector(".paused-cover")).opacity;
    }, signal);
    expect(opacity).toBe("1");
    await page.clock.runFor(500);
    await expect(page.locator("[data-time]")).toHaveText("0:03");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.locator(".paused-cover")).toHaveCount(0);
  }
});
