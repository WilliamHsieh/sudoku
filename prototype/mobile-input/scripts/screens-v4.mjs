// Captures the v4 screenshots (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v4.mjs [outDir]   (server must be running on :5180)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2] || 'recordings';
const URL = process.env.URL || 'http://localhost:5180/?cueMs=3600000';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.clock.install();
await page.goto(URL);

const tap = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(120);
};
const cell = (i) => `.cell[data-i="${i}"]`;
const key = (d) => `.key[data-d="${d}"]`;
const shot = (name) => page.screenshot({ path: join(OUT, name) });
// CSS animations run on the real clock, so the ring is frozen explicitly.
const freezeAnimations = (ms) =>
  page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), ms);
const resumeAnimations = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

await tap('#notes-mode');
for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1]]) {
  await tap(cell(i));
  await tap(key(d));
}
await page.clock.fastForward(222_000);
await tap(cell(55));
await page.waitForTimeout(400);
await shot('v4-candidate-color.png');

// Step one: the ring has landed on cell 18 but its 1 has not been removed yet.
await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
await tap('#undo');
await freezeAnimations(300);
await shot('v4-undo-hover.png');
await resumeAnimations();
await page.clock.runFor(800);
await page.waitForTimeout(700);
await shot('v4-undo-after.png');

await tap('#undo');
await page.clock.runFor(800);
await page.waitForTimeout(700);
await shot('v4-redo-enabled.png');

await tap(cell(7));
await tap(key(1));
await page.clock.runFor(800);
await page.waitForTimeout(500);
await shot('v4-redo-disabled.png');

await browser.close();
console.log('saved to', OUT);
