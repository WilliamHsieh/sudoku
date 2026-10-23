import { test, expect } from "@playwright/test";
import { cell, openBoard, solve, DEMO_PUZZLE } from "./helpers.js";

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

test("dialog focus blur stays open, but hidden covers it synchronously", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  await page.locator("[data-more]").filter({ visible: true }).click();
  await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeVisible();
  await expect(page.locator(".paused-cover")).toHaveCount(0);
  const opacity = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    return getComputedStyle(document.querySelector(".paused-cover")).opacity;
  });
  expect(opacity).toBe("1");
  await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeHidden();
});

const CLOCK_START = new Date("2026-10-24T12:00:00Z");

async function stopClock(page) {
  // Leave headroom for the protocol round trip while the installed clock runs.
  await page.clock.install({ time: new Date(CLOCK_START.getTime() - 60_000) });
  await page.clock.pauseAt(CLOCK_START);
}

for (const width of [390, 1280]) {
  test(`blur stops the clock synchronously and focus uses the #53 reveal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await stopClock(page);
    await openBoard(page);
    await page.clock.runFor(1_000);
    const sync = await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      return {
        visible: document.visibilityState,
        opacity: getComputedStyle(document.querySelector(".paused-cover")).opacity,
        animation: getComputedStyle(document.querySelector(".paused-cover")).animationName,
        paused: document.querySelector("#pause").getAttribute("aria-pressed"),
      };
    });
    expect(sync).toEqual({ visible: "visible", opacity: "1", animation: "none", paused: "true" });
    await page.clock.runFor(2_000);
    await expect(page.locator(".timer .time")).toHaveText("0:01");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "hold");
    await expect(page.locator(".paused-cover")).toHaveCSS("opacity", "1");
    await page.clock.runFor(249);
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "hold");
    await expect(page.locator(".timer .time")).toHaveText("0:01");
    await page.clock.runFor(1);
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "reveal");
    const reveal = await page.evaluate(() => {
      const board = document.querySelector(".board");
      const animation = board.getAnimations()[0];
      return {
        duration: animation.effect.getTiming().duration,
        from: animation.effect.getKeyframes()[0].filter,
        inert: board.inert,
      };
    });
    expect(reveal).toEqual({ duration: 600, from: "blur(8px)", inert: true });
    await page.clock.runFor(599);
    await expect(page.locator(".timer .time")).toHaveText("0:01");
    await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
    // The virtual timer and CSS have separate clocks. Finish CSS at its end,
    // then cross the real session's virtual 600ms deadline.
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
    await page.clock.runFor(1);
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    await expect(page.locator("#resume-status")).toHaveText("Resumed");
    await page.clock.runFor(1_000);
    await expect(page.locator(".timer .time")).toHaveText("0:02");
  });
}

for (const awayMs of [999, 1_000, 1_100]) {
  test(`blur then hidden uses the first departure for a ${awayMs}ms absence`, async ({ page }) => {
    await stopClock(page);
    await openBoard(page);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.clock.setFixedTime(new Date(CLOCK_START.getTime() + 900));
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.setFixedTime(new Date(CLOCK_START.getTime() + awayMs));
    const sync = await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      const cover = document.querySelector(".paused-cover");
      return {
        phase: document.querySelector(".play").dataset.resumePhase,
        cover: cover && getComputedStyle(cover).opacity,
        paused: document.querySelector("#pause").getAttribute("aria-pressed"),
        announcement: document.querySelector("#resume-status").textContent,
      };
    });
    expect(sync).toEqual({
      phase: awayMs < 1_000 ? "idle" : "hold",
      cover: awayMs < 1_000 ? null : "1",
      paused: awayMs < 1_000 ? "false" : "true",
      announcement: "",
    });
  });
}

for (const signal of ["blur", "visibilitychange", "pagehide", "freeze"]) {
  for (const view of ["fresh calendar", "loaded calendar", "finished puzzle"]) {
    test(`${signal} does not pause a ${view}`, async ({ page }) => {
      await stopClock(page);
      if (view === "fresh calendar") await page.goto("./");
      else if (view === "loaded calendar") {
        await openBoard(page);
        await page.getByRole("button", { name: "Journal", exact: true }).click();
      } else {
        const solution = solve(DEMO_PUZZLE);
        await openBoard(page, `./?q=0${solution.slice(1)}`);
        await cell(page, 0).click();
        await page.keyboard.press(solution[0]);
        await expect(page.locator(".success-card")).toBeVisible();
      }
      await page.evaluate((signal) => {
        if (signal === "visibilitychange") {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
          });
        }
        const target = ["visibilitychange", "freeze"].includes(signal) ? document : window;
        target.dispatchEvent(new Event(signal));
      }, signal);
      await page.clock.runFor(2_000);
      if (view !== "finished puzzle") {
        // Enter Play before the return signal to expose a latent pause created
        // in the calendar even though no cover could mount there.
        await page.getByRole("button", { name: "Play", exact: true }).click();
      } else await expect(page.locator(".success-card")).toBeVisible();
      await expect(page.locator(".paused-cover")).toHaveCount(0);
      await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "false");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      await expect(page.locator(".paused-cover")).toHaveCount(0);
      await expect(page.locator("#resume-status")).toHaveText("");
    });
  }
}
