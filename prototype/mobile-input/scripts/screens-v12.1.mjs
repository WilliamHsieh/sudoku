// Captures the v12.1 slot-hover screenshots and a short desktop video.
// Same script as v12, plus a restore-slot still. Server must be running on :5180.
// Usage: node scripts/screens-v12.1.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2] || 'recordings';
const URL = process.env.URL || 'http://localhost:5180/?cueMs=3600000';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const slot = async (page, i, d) => {
  const b = await cell(page, i).boundingBox();
  const col = (d - 1) % 3, row = Math.floor((d - 1) / 3);
  return { x: b.x + ((col + 0.5) * b.width) / 3, y: b.y + ((row + 0.5) * b.height) / 3 };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hover = async (page, i, d, ms = 1200) => {
  const p = await slot(page, i, d);
  await page.mouse.move(p.x, p.y, { steps: 12 });
  await wait(ms);
};

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.goto(URL);
for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1], [29, 3], [9, 2], [20, 6]]) {
  await cell(page, i).click();
  await page.keyboard.press(String(d));
}
await page.locator('#notes-mode').click();
await cell(page, 41).click();
await wait(400);

// Cell 41 (r5c6): Auto candidates 1379. 4 is blocked by the given 4 at 38.
await hover(page, 41, 3); // visible candidate
await page.screenshot({ path: join(OUT, 'v12.1-slot-hover.png') });
await hover(page, 41, 1); // another candidate
await hover(page, 41, 5); // empty, legal add
await hover(page, 41, 4); // blocked
await page.screenshot({ path: join(OUT, 'v12.1-slot-hover-blocked.png') });
await hover(page, 41, 3);
await page.mouse.down();
await page.mouse.up(); // hide 3
await wait(900);
await hover(page, 41, 3); // restorable
await page.screenshot({ path: join(OUT, 'v12.1-slot-hover-restore.png') });
await page.keyboard.down('Shift');
await wait(1400);
await page.mouse.down();
await page.mouse.up(); // Shift+click enters 3
await wait(1200);
await page.keyboard.up('Shift');
await wait(800);

await context.close();
await browser.close();

const videos = (await readdir(OUT)).filter((n) => n.endsWith('.webm')).sort();
const dest = join(OUT, 'v12.1-slot-hover.webm');
if (videos.length) {
  const src = join(OUT, videos[videos.length - 1]);
  if (src !== dest) await rename(src, dest);
  const bytes = (await stat(dest)).size;
  if (bytes > 15 * 1024 * 1024) throw new Error(`video ${bytes} bytes exceeds 15 MB`);
}
console.log('saved to', OUT);
