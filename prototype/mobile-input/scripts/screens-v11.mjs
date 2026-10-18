// Captures the v11 Shift-hover screenshot (1280x800 desktop, mouse, no demo overlays).
// Usage: node scripts/screens-v11.mjs [outDir]   (server must be running on :5180)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2] || 'recordings';
const URL = process.env.URL || 'http://localhost:5180/?cueMs=3600000';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.clock.install();
await page.goto(URL);

const cell = (i) => page.locator(`.cell[data-i="${i}"]`);
for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1], [29, 3], [9, 2], [20, 6]]) {
  await cell(i).click();
  await page.keyboard.press(String(d));
}
await page.clock.fastForward(222_000);
await page.locator('#notes-mode').click();

// The given 8 at r1c2 selected lights the 8 chips; the pointer rests on the 8 of r5c1.
await cell(1).click();
const b = await cell(36).boundingBox();
await page.mouse.move(b.x + (1.5 * b.width) / 3, b.y + (2.5 * b.height) / 3);
await page.keyboard.down('Shift');
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'v11-shift-hover.png') });
await page.keyboard.up('Shift');

await browser.close();
console.log('saved to', OUT);
