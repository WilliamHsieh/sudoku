// Captures the v9 screenshots (blue selection fill) (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v9.mjs [outDir]   (server must be running on :5180)
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

await tap('#notes-mode');
for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1]]) {
  await tap(cell(i));
  await tap(key(d));
}
await page.clock.fastForward(222_000);

// An empty cell selected: blue fill under the ring, its Auto candidates on top.
await tap(cell(75));
await page.waitForTimeout(400);
await shot('v9-selected-empty.png');

// A given selected: blue fill, the other 8s stay yellow and candidate 8s get chips.
await tap(cell(1));
await page.waitForTimeout(400);
await shot('v9-selected-given.png');

await browser.close();
console.log('saved to', OUT);
