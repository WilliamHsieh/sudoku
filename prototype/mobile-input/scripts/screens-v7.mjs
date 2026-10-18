// Captures the v7 screenshots (illegal drag hint, grey given cells) (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v7.mjs [outDir]   (server must be running on :5180)
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
const cdp = await context.newCDPSession(page);

await tap('#notes-mode');
for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1]]) {
  await tap(cell(i));
  await tap(key(d));
}
await page.clock.fastForward(222_000);

// A given selected: it keeps its grey under the ring, same digits turn yellow.
await tap(cell(50));
await page.waitForTimeout(400);
await shot('v7-given-selected.png');

// Mid-drag of an illegal 4 in r9c4: "Not allowed", no ghost, blockers tinted.
await tap(cell(75));
await page.waitForTimeout(300);
const k = await page.locator(key(4)).boundingBox();
const x = k.x + k.width / 2;
const y = k.y + k.height / 2;
const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty, id: 1 }],
});
await touch('touchStart', y);
for (let s = 1; s <= 10; s++) await touch("touchMove", y - s * 8);
await page.waitForTimeout(250);
await shot('v7-illegal-drag.png');
await touch("touchEnd", y - 80);

await browser.close();
console.log('saved to', OUT);
