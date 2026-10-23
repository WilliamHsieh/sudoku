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
    expect(idle.at - reveal.at).toBeGreaterThanOrEqual(320);
    expect(result.animations.filter((e) => e.type === "animationcancel")).toEqual([]);
    expect(result.animations).toContainEqual(
      expect.objectContaining({ type: "animationend", elapsed: 0.32 })
    );
  });
}
