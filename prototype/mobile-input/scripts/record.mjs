// Records a human-paced demo of the prototype in a 390x844 touch viewport.
// Usage: node scripts/record.mjs [outDir]   (server must be running on :5180)
import { chromium } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.argv[2] || 'recordings';
const URL = process.env.URL || 'http://localhost:5180/?cueMs=3000';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});

// Demo-only overlays: a finger dot and a caption strip. Not part of the app.
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style');
    css.textContent = `
      #touch-dot { position: fixed; z-index: 9999; width: 34px; height: 34px; margin: -17px 0 0 -17px;
        border-radius: 50%; background: rgb(255 140 0 / 0.45); border: 2px solid rgb(255 120 0 / 0.9);
        pointer-events: none; opacity: 0; transition: opacity 120ms ease-out, transform 120ms ease-out;
        transform: scale(0.6); left: 0; top: 0; }
      #touch-dot.down { opacity: 1; transform: scale(1); }
      #demo-caption { position: fixed; z-index: 9998; left: 12px; right: 12px; bottom: 18px; padding: 10px 12px;
        border-radius: 12px; background: rgb(20 24 33 / 0.88); color: #fff; font: 600 14px/1.3 system-ui, sans-serif;
        text-align: center; pointer-events: none; }
      #demo-caption:empty { display: none; }`;
    document.head.appendChild(css);
    const dot = document.createElement('div');
    dot.id = 'touch-dot';
    const cap = document.createElement('div');
    cap.id = 'demo-caption';
    document.body.append(dot, cap);
    const place = (e) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      dot.style.left = `${t.clientX}px`;
      dot.style.top = `${t.clientY}px`;
    };
    addEventListener('touchstart', (e) => { place(e); dot.classList.add('down'); }, { capture: true, passive: true });
    addEventListener('touchmove', place, { capture: true, passive: true });
    addEventListener('touchend', () => dot.classList.remove('down'), { capture: true, passive: true });
  });
});

const page = await context.newPage();
await page.goto(URL);
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }],
  });
const wait = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((t) => { document.getElementById('demo-caption').textContent = t; }, text);
const centerOf = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const cell = (i) => `.cell[data-i="${i}"]`;
const key = (d) => `.key[data-d="${d}"]`;

async function tap(sel, after = 650) {
  const p = await centerOf(sel);
  await touch('touchStart', p.x, p.y);
  await wait(90);
  await touch('touchEnd', p.x, p.y);
  await wait(after);
}

// Ease-in-out finger path, ~16ms per frame.
async function swipe(sel, dy, { ms = 380, hold = 220, after = 700, shot } = {}) {
  const p = await centerOf(sel);
  await touch('touchStart', p.x, p.y);
  await wait(120);
  const frames = Math.round(ms / 16);
  for (let f = 1; f <= frames; f++) {
    const t = f / frames;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await touch('touchMove', p.x + Math.sin(t * 3) * 1.5, p.y - dy * e);
    await wait(16);
  }
  await wait(hold);
  if (shot) await page.screenshot({ path: shot });
  await touch('touchEnd', p.x, p.y - dy);
  await wait(after);
}

await wait(400);
await caption('Tap a cell to select it');
await tap(cell(2), 900);

await caption('Tap 4 → writes the answer');
await tap(key(4), 1000);
await caption('Tap 4 again → clears it');
await tap(key(4), 1000);

await caption('Swipe up on a key → add candidate');
await swipe(key(1), 70);
await swipe(key(2), 75, { shot: join(OUT, 'mobile-input-opus-armed-swipe.png') });
await swipe(key(4), 70, { after: 900 });

await caption('Swipe the same key again → remove candidate');
await swipe(key(2), 72, { hold: 300, after: 1000 });

await caption('Short drag below threshold → glides back, nothing written');
await swipe(key(6), 17, { ms: 300, hold: 450, after: 1200 });

await caption('Two candidates left (1, 4). Remove 1 → only 4 remains');
await swipe(key(1), 72, { after: 1200 });
await caption('Lone candidate flashes green every 15s (3s in this demo)');
await page.waitForSelector(`${cell(2)} .n.lone-flash`);
await wait(500);
await page.screenshot({ path: join(OUT, 'mobile-input-opus-single-cue.png') });
await wait(1300);

await caption('Create a conflict: 5 in a row that already has 5');
await tap(cell(3), 700);
await tap(key(5), 600);
await page.screenshot({ path: join(OUT, 'mobile-input-opus-conflict.png') });
await wait(1200);

await caption('Undo');
await tap('#undo', 1300);

await caption('Notes: Auto → candidates from your entries');
await tap('#notes-mode', 300);
await caption('Lone candidates in Auto notes flash too');
await page.waitForSelector('.n.lone-flash');
await wait(500);
await page.screenshot({ path: join(OUT, 'mobile-input-opus-auto-notes.png') });
await wait(1200);

await caption('A wrong answer still drives Auto notes (never checked vs solution)');
await tap(cell(21), 700);
await tap(key(2), 1800);

await caption('More → single-candidate cue setting (on by default)');
await tap('#more', 1000);
await tap('#opt-single', 900);
await tap('#sheet-close', 600);
await caption('Cue off: no flashes');
await wait(3300);
await caption('Turned back on: flashes resume after one interval');
await tap('#more', 800);
await tap('#opt-single', 700);
await tap('#sheet-close', 300);
await page.waitForSelector('.n.lone-flash');
await wait(1600);

await caption('Swipe works in Auto mode too: remove 2 from r1c3');
await tap(cell(2), 700);
await swipe(key(2), 72, { after: 1200 });

await caption('Undo, undo');
await tap('#undo', 900);
await tap('#undo', 1200);

await caption('Back to Manual notes');
await tap('#notes-mode', 1200);
await caption('');
await wait(300);

const video = page.video();
await context.close();
await browser.close();
const raw = await video.path();
await rename(raw, join(OUT, 'mobile-input-opus.webm'));
console.log('saved', join(OUT, 'mobile-input-opus.webm'));
