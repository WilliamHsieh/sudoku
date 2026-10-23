import { test, expect } from "@playwright/test";
import { DEMO_PUZZLE } from "./helpers.js";

// These regressions use real browser timers and CSS animations. A virtual
// clock cannot reproduce a blocked main thread or observe animation completion.
for (const busyMs of [250, 650]) {
  test(`a ${busyMs}ms busy main thread cannot shorten or skip the reveal`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`./?q=${DEMO_PUZZLE}`);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1_100);
    const result = await page.evaluate(async (busyMs) => {
      const play = document.querySelector(".play");
      const board = document.querySelector(".board");
      const samples = [];
      const animations = [];
      let lastPhase;
      const sample = () => {
        const phase = play.dataset.resumePhase;
        if (phase !== lastPhase) {
          samples.push({ at: performance.now(), phase, inert: board.inert });
          lastPhase = phase;
        }
      };
      const observer = new MutationObserver(sample);
      observer.observe(play, { attributes: true });
      const animationEvent = (event) => {
        if (event.target === board && event.animationName.includes("rv-board")) {
          animations.push({ type: event.type, at: performance.now(), elapsed: event.elapsedTime });
        }
      };
      board.addEventListener("animationend", animationEvent);
      board.addEventListener("animationcancel", animationEvent);
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      setTimeout(() => {
        const until = performance.now() + busyMs;
        while (performance.now() < until) {
          /* Deliberately block the hold callback. */
        }
      }, 100);
      await new Promise((resolve) => setTimeout(resolve, busyMs + 1_500));
      observer.disconnect();
      board.removeEventListener("animationend", animationEvent);
      board.removeEventListener("animationcancel", animationEvent);
      return { samples, animations };
    }, busyMs);
    await testInfo.attach("real-animation-timing", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    const hold = result.samples.find((s) => s.phase === "hold");
    const reveal = result.samples.find((s) => s.phase === "reveal");
    const idle = result.samples.find((s) => s.phase === "idle");
    expect(hold?.inert).toBe(true);
    expect(reveal?.inert).toBe(true);
    expect(idle?.inert).toBe(false);
    expect(idle.at - reveal.at).toBeGreaterThanOrEqual(600);
    expect(result.animations.filter((e) => e.type === "animationcancel")).toEqual([]);
    expect(result.animations).toContainEqual(
      expect.objectContaining({ type: "animationend", elapsed: 0.6 })
    );
  });
}

async function visibility(page, hidden) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: hidden ? "hidden" : "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function startAutoReturn(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await visibility(page, true);
  await page.waitForTimeout(1_100);
  await visibility(page, false);
}

test("CSS pins the 600ms curve, 8px blur and synchronized chrome reveal", async ({ page }) => {
  await startAutoReturn(page);
  const result = await page.evaluate(async () => {
    const play = document.querySelector(".play");
    while (play.dataset.resumePhase !== "reveal") {
      await new Promise(requestAnimationFrame);
    }
    const read = (selector) => {
      const element = document.querySelector(selector);
      const animation = element.getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
      return {
        duration: animation.effect.getTiming().duration,
        easing: getComputedStyle(element).animationTimingFunction,
        transitionEasing: getComputedStyle(element).transitionTimingFunction,
        keyframes: animation.effect.getKeyframes(),
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      };
    };
    const board = read(".board");
    const cover = read(".paused-cover");
    const chrome = read(".chrome-dim");
    return { board, cover, chrome };
  });
  const ease = "cubic-bezier(0.33, 1, 0.68, 1)";
  for (const part of [result.board, result.cover, result.chrome]) {
    expect(part.duration).toBe(600);
  }
  expect(result.board.easing).toBe(ease);
  expect(result.cover.easing).toBe(ease);
  expect(result.chrome.transitionEasing).toBe(ease);
  expect(result.board.keyframes[0]).toMatchObject({ opacity: "0", filter: "blur(8px)" });
  expect(result.board.keyframes.at(-1)).toMatchObject({ opacity: "1", filter: "blur(0px)" });
  expect(result.cover.keyframes[0].opacity).toBe("1");
  expect(result.cover.keyframes.at(-1).opacity).toBe("0");
  expect(Number(result.chrome.keyframes[0].opacity)).toBeCloseTo(0.4, 5);
  expect(result.chrome.keyframes.at(-1).opacity).toBe("1");
  expect(result.board.inert).toBe(true);
  expect(result.board.ariaHidden).toBe("true");
  expect(result.chrome.inert).toBe(true);
});

for (const phase of ["hold", "reveal"]) {
  for (const action of ["Resume", "P"]) {
    test(`${action} cancels the ${phase} at once`, async ({ page }) => {
      await startAutoReturn(page);
      // Pause the visual animations to keep the real hit target stable for a tap.
      if (phase === "reveal") {
        await page.evaluate(async () => {
          while (document.querySelector(".play").dataset.resumePhase !== "reveal") {
            await new Promise(requestAnimationFrame);
          }
          document.getAnimations().forEach((animation) => {
            animation.pause();
            animation.currentTime = 120;
          });
        });
      }
      if (action === "Resume") await page.locator("#resume").click({ force: true });
      else await page.keyboard.press("p");
      await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
      await expect(page.locator(".board")).not.toHaveAttribute("inert", "");
      await expect(page.locator("#pause")).toBeFocused();
      await expect(page.locator("#resume-status")).toHaveText("");
      await page.waitForTimeout(1_000);
      await expect(page.locator(".paused-cover, .paused-leave")).toHaveCount(0);
    });
  }
}
