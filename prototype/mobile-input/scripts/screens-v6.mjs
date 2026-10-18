// Captures the v6 screenshots (travelling undo ring, refused pencil mark) (390x844, touch, no demo overlays).
// Usage: node scripts/screens-v6.mjs [outDir]   (server must be running on :5180)
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
const cdp = await context.newCDPSession(page);
const swipeUp = async (sel, dy) => {
  const b = await page.locator(sel).boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const touch = (type, ty) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty, id: 1 }],
  });
  await touch('touchStart', y);
  for (let s = 1; s <= 8; s++) await touch('touchMove', y - (dy * s) / 8);
  await touch('touchEnd', y - dy);
};
const resumeAnimations = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

await tap('#notes-mode');
for (const [i, d] of [[36, 3], [45, 2], [47, 9], [33, 4], [2, 3]]) {
  await tap(cell(i));
  await tap(key(d));
}
await tap(cell(33));
await tap('#erase');
await page.clock.fastForward(222_000);
await tap(cell(36));
await page.waitForTimeout(300);

// Mid-travel: the ring is on its way from 36 to 33, every yellow highlight is off.
await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
await tap('#undo');
await page.clock.runFor(40);
await freezeAnimations(40);
await shot('v6-undo-mid.png');
await resumeAnimations();
await page.clock.runFor(1000);
await page.waitForTimeout(500);
await shot('v6-undo-after.png');

// Refused pencil mark: 3 is already in r9c6's row, column and box.
await tap(cell(77));
await page.waitForTimeout(300);
await swipeUp(key(3), 60);
await freezeAnimations(70);
await shot('v6-refusal-flash.png');

await browser.close();
console.log('saved to', OUT);
