import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    test.describe(`Cancel motion at ${viewport.width}, ${reducedMotion}`, () => {
      test.use({ viewport, reducedMotion });

      test("opens forward with ease-out and keeps Restart focus", async ({ page }, testInfo) => {
        await openBoard(page, "./?shot=1&freeze");
        await page.locator("[data-more]").filter({ visible: true }).click();
        await page.locator("#opt-restart").click();
        await page.evaluate(() =>
          Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})))
        );
        // Sample after the click handler, including its synchronous starting pose.
        await page.evaluate(() => {
          window.__cancelMotion = new Promise((resolve) => {
            document.addEventListener("click", function sampleClick(event) {
              if (event.target.id !== "confirm-cancel") return;
              document.removeEventListener("click", sampleClick);
              queueMicrotask(() => {
                const sheet = document.querySelector("dialog.opts");
                const height = sheet.getBoundingClientRect().height;
                const animation = sheet.getAnimations()[0];
                const timing = animation?.effect.getTiming();
                const keyframes = animation?.effect.getKeyframes();
                const easing = getComputedStyle(document.documentElement)
                  .getPropertyValue("--ease-out")
                  .trim();
                const samples = [];
                function sample() {
                  const transform = getComputedStyle(sheet).transform;
                  const y = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
                  samples.push({
                    ms: Number(animation?.currentTime ?? 260),
                    y,
                    fraction: y / height,
                  });
                  if (
                    animation &&
                    animation.playState !== "finished" &&
                    animation.playState !== "idle"
                  ) {
                    requestAnimationFrame(sample);
                  } else
                    resolve({
                      timing,
                      keyframes,
                      easing,
                      samples,
                      animations: sheet.getAnimations().length,
                    });
                }
                sample();
              });
            });
          });
        });
        await page.locator("#confirm-cancel").click();
        const result = await page.evaluate(() => window.__cancelMotion);
        await testInfo.attach("cancel-motion", {
          body: JSON.stringify(result),
          contentType: "application/json",
        });
        if (reducedMotion === "reduce") {
          expect(result.timing).toBeUndefined();
          expect(result.animations).toBe(0);
          expect(result.samples.map((s) => s.y)).toEqual([0]);
        } else {
          expect(result.timing.duration).toBe(260);
          const curve = (value) => value.match(/[\d.]+/g).map(Number);
          expect(curve(result.timing.easing)).toEqual(curve(result.easing));
          expect(result.timing.direction).toBe("normal");
          expect(result.keyframes.map((k) => k.transform)).toEqual(["translateY(100%)", "none"]);
          const samples = result.samples;
          expect(samples.length).toBeGreaterThan(5);
          expect(samples[0].fraction).toBeGreaterThan(0.95);
          expect(samples.at(-1).y).toBeCloseTo(0, 2);
          for (let i = 1; i < samples.length; i++) {
            expect(samples[i].y).toBeLessThanOrEqual(samples[i - 1].y + 0.1);
          }
          const nearest = (ms) =>
            samples.reduce((a, b) => (Math.abs(a.ms - ms) < Math.abs(b.ms - ms) ? a : b));
          const early = samples[0].fraction - nearest(260 / 3).fraction;
          const late = nearest(520 / 3).fraction - samples.at(-1).fraction;
          expect(early).toBeGreaterThan(0.6);
          expect(late).toBeLessThan(0.15);
          expect(early).toBeGreaterThan(late * 3);
        }
        await expect(page.locator("dialog.confirm")).toBeHidden();
        await expect(page.locator("#opt-restart")).toBeFocused();
      });
    });
  }
}
