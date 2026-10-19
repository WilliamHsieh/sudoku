// v13 stills + a human-paced desktop demo. Server must be on :5180.
// Usage: node scripts/screens-v13.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2] || 'recordings';
const URL = process.env.URL || 'http://localhost:5180/?cueMs=3600000';
const REF = '/home/ubuntu/.cursor/projects/workspace/uploads/combo_09ca.html';
await mkdir(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const key = (page, d) => page.locator(`.key[data-d="${d}"]`);
const center = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const moveTo = async (page, loc) => {
  const p = await center(loc);
  await page.mouse.move(p.x, p.y, { steps: 25 });
};
const tap = async (page, loc) => {
  await moveTo(page, loc);
  await page.mouse.down();
  await page.mouse.up();
  await wait(1500);
};

async function midGame(page) {
  await page.locator('#notes-mode').click();
  for (const [i, d] of [[55, 9], [5, 5], [11, 9], [27, 6], [18, 1], [29, 3], [9, 2], [20, 6]]) {
    await cell(page, i).click();
    await page.keyboard.press(String(d));
  }
  await cell(page, 41).click();
  await page.keyboard.press('8'); // conflicts with given 8s
  await cell(page, 1).click(); // given 8: selected + same-digit + chips + the conflict
}

const browser = await chromium.launch();

// --- mobile still ---
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(URL);
  await midGame(page);
  await wait(400);
  await page.screenshot({ path: join(OUT, 'v13-mobile.png') });
  await context.close();
}

// --- desktop still ---
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(URL);
  await midGame(page);
  await wait(400);
  await page.screenshot({ path: join(OUT, 'v13-desktop.png') });
  await context.close();
}

// --- combo C reference + side-by-side ---
{
  const context = await browser.newContext({
    viewport: { width: 2000, height: 1100 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`file://${REF}`);
  const phone = page.locator('#pC.phone, .phone.t-C, #pC');
  await phone.waitFor({ state: 'visible' });
  const refPath = join(OUT, 'combo-mobile-C.png');
  await phone.screenshot({ path: refPath });
  await context.close();

  // stitch ours | reference at a common height
  const ours = join(OUT, 'v13-mobile.png');
  const compare = join(OUT, 'v13-mobile-compare.png');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('ffmpeg', [
    '-y',
    '-i', ours,
    '-i', refPath,
    '-filter_complex',
    '[0:v]scale=390:844[a];[1:v]scale=390:844[b];[a][b]hstack=inputs=2',
    '-frames:v', '1',
    '-update', '1',
    compare,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'ffmpeg stitch failed');
}

// --- human-paced video ---
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(URL);
  await wait(1500);

  await tap(page, page.locator('#notes-mode')); // Auto on
  await tap(page, cell(page, 41)); // select
  await tap(page, key(page, 7)); // answer
  await tap(page, cell(page, 42)); // another cell
  await page.keyboard.down('Shift');
  await wait(1500);
  await tap(page, key(page, 2)); // note
  await page.keyboard.up('Shift');
  await wait(1500);
  await tap(page, key(page, 4)); // conflict (given 4 nearby)
  await tap(page, page.locator('#undo'));
  await tap(page, page.locator('#notes-mode')); // switch off
  await wait(1500);

  await context.close();
}

await browser.close();

const videos = (await readdir(OUT)).filter((n) => n.endsWith('.webm')).sort();
const dest = join(OUT, 'v13-demo.webm');
if (videos.length) {
  const src = join(OUT, videos[videos.length - 1]);
  if (src !== dest) await rename(src, dest);
  const bytes = (await stat(dest)).size;
  if (bytes > 15 * 1024 * 1024) throw new Error(`video ${bytes} bytes exceeds 15 MB`);
}
console.log('saved to', OUT);
