// Shared harness for the demo recordings: a 390x844 touch viewport, real CDP
// touch input at human pace, and demo-only overlays (finger dot + captions).
import { chromium } from '@playwright/test';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

export async function openDemo({ url, out, name }) {
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: out, size: { width: 390, height: 844 } },
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
  await page.goto(url);
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
  async function swipe(sel, dy, { ms = 380, hold = 220, after = 700, pre = 120, shot } = {}) {
    const p = await centerOf(sel);
    await touch('touchStart', p.x, p.y);
    await wait(pre);
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

  const shot = (file) => page.screenshot({ path: join(out, file) });

  async function finish() {
    const video = page.video();
    await context.close();
    await browser.close();
    const raw = await video.path();
    await rename(raw, join(out, `${name}.webm`));
    console.log('saved', join(out, `${name}.webm`));
  }

  return { page, wait, caption, cell, key, tap, swipe, shot, finish };
}
