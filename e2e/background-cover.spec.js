import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

// Deliberately read in the dispatching task: waiting for a locator or a timeout
// could hide the transparent first frame that a task-switcher capture can see.
for (const signal of ["visibilitychange", "blur", "pagehide", "freeze"]) {
  test(`${signal} synchronously covers the board without an entrance animation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openBoard(page);
    const frames = await page.evaluate(async (signal) => {
      if (signal === "visibilitychange") {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      }
      const target = ["visibilitychange", "freeze"].includes(signal) ? document : window;
      const read = () => {
        const cover = document.querySelector(".paused-cover");
        const board = document.querySelector(".board");
        const css = cover && getComputedStyle(cover);
        return {
          opacity: css?.opacity,
          animation: css?.animationName,
          transition: css?.transitionDuration,
          transform: css?.transform,
          boardVisibility: getComputedStyle(board).visibility,
          inert: board.inert,
        };
      };
      target.dispatchEvent(new Event(signal));
      const sync = read();
      await new Promise(requestAnimationFrame);
      return { sync, frame: read() };
    }, signal);
    for (const frame of [frames.sync, frames.frame]) {
      expect(frame).toEqual({
        opacity: "1",
        animation: "none",
        transition: "0s",
        transform: "none",
        boardVisibility: "hidden",
        inert: true,
      });
    }
  });
}

test("duplicate departure and return signals keep the full hold without a live-board frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const start = new Date("2026-10-24T12:00:00Z");
  await page.clock.setFixedTime(start);
  await openBoard(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.setFixedTime(new Date(start.getTime() + 1_100));
  const result = await page.evaluate(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("freeze"));
    // Early focus/resume must not unpause a hidden document.
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("resume"));
    const hiddenPhase = document.querySelector(".play").dataset.resumePhase;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    const read = () => ({
      phase: document.querySelector(".play").dataset.resumePhase,
      opacity: getComputedStyle(document.querySelector(".paused-cover")).opacity,
      boardVisibility: getComputedStyle(document.querySelector(".board")).visibility,
    });
    const sync = read();
    await new Promise(requestAnimationFrame);
    return { hiddenPhase, sync, frame: read() };
  });
  expect(result.hiddenPhase).toBe("idle");
  for (const frame of [result.sync, result.frame]) {
    expect(frame).toEqual({ phase: "hold", opacity: "1", boardVisibility: "hidden" });
  }
  await expect(page.locator(".paused-cover")).toHaveCount(0);
  await expect(page.locator(".board")).not.toHaveAttribute("inert", "");
});

for (const interrupted of ["manual entrance", "manual exit", "auto reveal"]) {
  test(`backgrounding during ${interrupted} restores an opaque cover synchronously`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBoard(page);
    const result = await page.evaluate(async (interrupted) => {
      if (interrupted === "auto reveal") {
        const at = Date.now();
        window.dispatchEvent(new Event("blur"));
        // Pin only absence classification; leave animations and hold on real time.
        const originalNow = Date.now;
        Date.now = () => at + 1_100;
        window.dispatchEvent(new Event("focus"));
        Date.now = originalNow;
        while (document.querySelector(".play").dataset.resumePhase !== "reveal") {
          await new Promise(requestAnimationFrame);
        }
      } else {
        document.querySelector("#pause").click();
        await new Promise(requestAnimationFrame);
        if (interrupted === "manual exit") {
          document.querySelector("#resume").click();
          await new Promise(requestAnimationFrame);
        }
      }
      window.dispatchEvent(new Event("blur"));
      const cover = document.querySelector(".paused-cover");
      return {
        opacity: cover && getComputedStyle(cover).opacity,
        animation: cover && getComputedStyle(cover).animationName,
        reason: document.querySelector(".play").dataset.pauseReason,
        phase: document.querySelector(".play").dataset.resumePhase,
        boardVisibility: getComputedStyle(document.querySelector(".board")).visibility,
      };
    }, interrupted);
    expect(result).toEqual({
      opacity: "1",
      animation: "none",
      reason: interrupted === "manual entrance" ? "manual" : "auto",
      phase: "idle",
      boardVisibility: "hidden",
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    if (interrupted === "manual entrance") {
      await expect(page.locator(".play")).toHaveAttribute("data-pause-reason", "manual");
      await expect(page.locator(".paused-cover")).toHaveCSS("opacity", "1");
    }
  });
}

test("moving focus between page controls does not pause", async ({ page }) => {
  await openBoard(page);
  await page.locator("#pause").focus();
  await page.locator("[data-more]").last().focus();
  await expect(page.locator(".paused-cover")).toHaveCount(0);
  await expect(page.locator(".play")).toHaveAttribute("data-pause-reason", "none");
});
