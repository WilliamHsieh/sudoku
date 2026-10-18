import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const outDir = "/tmp/sudoku-demo";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  // Match the CSS viewport. A device-pixel video size leaves the page in the
  // corner of a gray frame when deviceScaleFactor is greater than 1.
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
const session = await context.newCDPSession(page);
const started = Date.now();
const log = (message) => console.log(`${((Date.now() - started) / 1000).toFixed(1)}s ${message}`);

async function sleep(ms) {
  await page.waitForTimeout(ms);
}

async function touch(type, x, y) {
  const touchPoints = type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 10, radiusY: 10 }];
  await session.send("Input.dispatchTouchEvent", { type, touchPoints });
}

async function tap(x, y) {
  await touch("touchStart", x, y);
  await sleep(110);
  await touch("touchEnd");
  await sleep(160);
}

async function pointOf(selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`missing ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function tapSelector(selector) {
  const point = await pointOf(selector);
  await tap(point.x, point.y);
}

async function swipeUp(selector, distance, duration, hold, onHold) {
  const start = await pointOf(selector);
  const steps = Math.max(12, Math.round(duration / 18));
  await touch("touchStart", start.x, start.y);
  await sleep(50);
  for (let i = 1; i <= steps; i += 1) {
    const progress = 1 - (1 - i / steps) ** 2;
    await touch("touchMove", start.x, start.y - distance * progress);
    await sleep(duration / steps);
  }
  if (onHold) await onHold();
  if (hold) await sleep(hold);
  await touch("touchEnd");
}

await page.goto("http://127.0.0.1:4173/?cueInterval=2200");
log("board");
await sleep(1100);

log("select given 5");
await tapSelector('[data-r="0"][data-c="0"]');
await sleep(900);
await page.screenshot({ path: `${outDir}/select.png` });
await sleep(400);

log("select empty cell");
await tapSelector('[data-r="0"][data-c="2"]');
await sleep(700);

log("tap 4");
await tapSelector('.key[data-digit="4"]');
await sleep(900);

log("tap 4 again to clear");
await tapSelector('.key[data-digit="4"]');
await sleep(800);

log("tap 1");
await tapSelector('.key[data-digit="1"]');
await sleep(800);

log("select note cell");
await tapSelector('[data-r="1"][data-c="1"]');
await sleep(600);

log("swipe add 8");
await swipeUp('.key[data-digit="8"]', 84, 760, 480, async () => {
  await page.screenshot({ path: `${outDir}/swipe.png` });
});
await sleep(1100);

log("swipe remove 8");
await swipeUp('.key[data-digit="8"]', 84, 720, 380);
await sleep(1100);

log("aborted swipe");
await swipeUp('.key[data-digit="9"]', 16, 480, 120);
await sleep(1200);

log("create conflict");
await tapSelector('[data-r="0"][data-c="2"]');
await sleep(400);
await tapSelector('.key[data-digit="5"]');
await sleep(500);

log("wait for candidate flash");
await page.waitForFunction(
  () => document.querySelector('.cell[data-r="4"][data-c="4"] .note.cue'),
  null,
  { timeout: 4000 },
);
await page.screenshot({ path: `${outDir}/cue.png` });
await sleep(1200);

log("more");
await tapSelector("#more");
await sleep(1400);
await tapSelector("#sheet-close");
await sleep(500);

log("manual notes");
await tapSelector("#mode");
await sleep(1200);
await tapSelector('[data-r="2"][data-c="0"]');
await sleep(400);
await swipeUp('.key[data-digit="3"]', 80, 640, 280);
await sleep(1000);

log("auto notes");
await tapSelector("#mode");
await sleep(1100);

log("undo");
await tapSelector("#undo");
await sleep(900);
await tapSelector("#undo");
await sleep(1100);

log("done");
const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();
console.log("webm", webm);
