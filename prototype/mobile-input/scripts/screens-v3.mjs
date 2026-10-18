// Captures the v3 design-review screenshots (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v3.mjs [outDir]   (server must be running on :5180)
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
for (const [i, d] of [[36, 3], [45, 2], [47, 9], [33, 4], [2, 3]]) {
  await tap(cell(i));
  await tap(key(d));
}
await page.clock.fastForward(462_000);
await tap(cell(36));
await page.waitForTimeout(400);
await shot('v3-selected-filled.png');

await tap(cell(7));
await page.waitForTimeout(400);
await shot('v3-selected-empty.png');

await tap('#pause');
await page.waitForTimeout(300);
await shot('v3-paused.png');
await tap('#resume');

await tap('#notes-mode');
await tap('#more');
await page.waitForTimeout(300);
await shot('v3-options-manual.png');

await tap('#opt-reset');
await page.waitForTimeout(300);
await shot('v3-restart-confirm.png');

await browser.close();
console.log('saved to', OUT);
