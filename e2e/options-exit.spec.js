import { test, expect } from "@playwright/test";
import { decode } from "./painted-options.js";

// DOM geometry stays smooth during the Chromium compositor regression. Read
// every damaged compositor frame instead; decode PNGs in memory using node:zlib.
// Average a 3x3 patch to tolerate subpixel text antialiasing. Normalize
// contrast because the returning desktop sheet crosses the fading confirm.
// Fixed ink thresholds can lose the heading there even when it paints smoothly.
function headingPatch(image, x, width) {
  const pixels = new Float32Array(width * image.h);
  for (let y = 1; y < image.h - 1; y++) {
    for (let dx = 0; dx < width; dx++) {
      let sum = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          sum += image.data[((y + oy) * image.w + x + dx + ox) * image.c];
        }
      }
      pixels[y * width + dx] = sum / 9;
    }
  }
  return pixels;
}

function headerMarker(data, box, heading) {
  const image = decode(data);
  const x = Math.floor(heading.x),
    y = Math.floor(heading.y);
  const width = Math.floor(heading.width),
    height = Math.floor(heading.height);
  const patch = headingPatch(image, x, width),
    samples = [];
  for (let dy = 1; dy < height - 1; dy += 2) {
    for (let dx = 1; dx < width - 1; dx += 2) {
      samples.push({ dx, dy, value: patch[(y + dy) * width + dx] });
    }
  }
  const ink = samples.filter((s) => s.value < 175);
  const mean = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
  for (const s of samples) s.value -= mean;
  const variance = samples.reduce((sum, s) => sum + s.value * s.value, 0);
  return { x, offsetY: y - Math.floor(box.y), width, height, samples, variance, ink };
}

function paintedTop(data, box, marker, viewport) {
  const image = decode(data);
  const patch = headingPatch(image, marker.x, marker.width);
  let best = 0,
    top = viewport.height;
  for (
    let y = Math.max(0, Math.floor(box.y) - 3);
    y < viewport.height - marker.offsetY - marker.height;
    y++
  ) {
    let sum = 0,
      squared = 0,
      cross = 0;
    for (const s of marker.samples) {
      const value = patch[(y + marker.offsetY + s.dy) * marker.width + s.dx];
      sum += value;
      squared += value * value;
      cross += value * s.value;
    }
    const variance = squared - (sum * sum) / marker.samples.length;
    const correlation = variance > 0 ? cross / Math.sqrt(variance * marker.variance) : 0;
    // Require visible heading contrast as well as a close spatial match.
    if (cross / marker.variance > 0.04 && correlation > 0.9 && correlation > best) {
      best = correlation;
      top = y;
    }
  }
  return top;
}

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {}))
    );
    // Cross a paint after the animation's final style has been applied.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const exit of ["cancel", "restart"]) {
    test(`painted options move monotonically through ${exit} at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize(viewport);
      await page.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
      // Repeat because the old compositor failure depends on paint scheduling.
      for (let run = 0; run < 3; run++) {
        await page.goto("./?shot=1");
        await page.locator(".board > .cell").first().waitFor();
        await page.locator("[data-more]").filter({ visible: true }).first().click();
        await settle(page);
        const box = await page.locator("dialog.opts").boundingBox();
        const heading = await page.locator("#opts-title").boundingBox();
        const openPixels = await page.screenshot();
        const marker = headerMarker(openPixels, box, heading);
        expect(marker.ink.length).toBeGreaterThan(20);
        const openTop = paintedTop(openPixels, box, marker, viewport);
        expect(openTop).toBeLessThan(viewport.height);
        await page.locator("#opt-restart").click();
        await settle(page);
        await page.screenshot();
        const cdp = await page.context().newCDPSession(page);
        const frames = [];
        cdp.on("Page.screencastFrame", (frame) => {
          frames.push(frame);
          void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
        });
        try {
          await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
          await settle(page);
          const button = await page
            .locator(exit === "cancel" ? "#confirm-cancel" : "#confirm-ok")
            .boundingBox();
          await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, {
            steps: 10,
          });
          await settle(page);
          await page.mouse.down();
          await settle(page);
          const start = await page.evaluate(() => performance.timeOrigin + performance.now());
          await page.mouse.up();
          // Record a real-time window, including frames after the 260ms exit.
          // No DOM reads during the exit: they can change rendering behavior.
          await page.waitForTimeout(700);
          await cdp.send("Page.stopScreencast");
          const samples = frames
            .filter((frame) => frame.metadata.timestamp * 1000 >= start)
            // CDP can deliver frames out of timestamp order under load.
            // Check paint order, rather than protocol delivery order.
            .sort((a, b) => a.metadata.timestamp - b.metadata.timestamp)
            .map((frame) => ({
              ms: Math.round(frame.metadata.timestamp * 1000 - start),
              top: paintedTop(frame.data, box, marker, viewport),
            }));
          expect(samples.length).toBeGreaterThan(3);
          const series = JSON.stringify(samples);
          let nearest = viewport.height;
          for (const sample of samples) {
            if (exit === "cancel") {
              expect(sample.top, series).toBeLessThanOrEqual(nearest + 1);
              nearest = Math.min(nearest, sample.top);
            } else {
              // Restart dismisses the parked options; they must never reappear.
              expect(sample.top, series).toBe(viewport.height);
            }
          }
          if (exit === "cancel") {
            expect(samples.at(-1).top, series).toBeCloseTo(openTop, 0);
            await expect(page.locator("dialog.opts")).toBeVisible();
          } else {
            await expect(page.locator("dialog.opts")).toBeHidden();
          }
          await expect(page.locator("dialog.confirm")).toBeHidden();
        } finally {
          await cdp.detach();
        }
      }
    });
  }
}
