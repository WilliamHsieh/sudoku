// Captures the v10 screenshots (answers in dark ink) (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v10.mjs [outDir]   (server must be running on :5180)
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

for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1], [29, 3], [9, 2], [20, 6]]) {
  await tap(cell(i));
  await tap(key(d));
}
await page.clock.fastForward(222_000);

// Several answers, the answer 9 at r2c3 selected: the other 9s (answers and givens) turn yellow.
await tap(cell(11));
await page.waitForTimeout(400);
await shot('v10-answers.png');

// Auto notes, the answer 6 at r4c1 selected: blue fill, other 6s yellow, candidate 6s on chips.
await tap('#notes-mode');
await tap(cell(27));
await page.waitForTimeout(400);
await shot('v10-selected-answer.png');

await browser.close();
console.log('saved to', OUT);
