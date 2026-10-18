// Records the v2 demo: Erase-reset in Auto, undo animation, quick swipes,
// double-tap fill, the global cue clock, and pause/resume.
// Usage: node scripts/record-v2.mjs [outDir]   (server must be running on :5180)
import { openDemo } from './demo-kit.mjs';

const OUT = process.argv[2] || 'recordings';
const NAME = 'mobile-input-opus-v2';
const { page, wait, caption, cell, key, tap, swipe, shot, finish } = await openDemo({
  url: process.env.URL || 'http://localhost:5180/?cueMs=4000',
  out: OUT,
  name: NAME,
});

await wait(400);
await caption('Notes: Auto');
await tap('#notes-mode', 700);
await caption('Edit the auto candidates: swipe 3 and 9 out');
await tap(cell(41), 500);
await swipe(key(3), 70, { after: 450 });
await swipe(key(9), 72, { hold: 160, after: 700, shot: `${OUT}/${NAME}-armed-swipe.png` });
await shot(`${NAME}-erase-before.png`);
await caption('Erase resets the cell to its auto candidates');
await tap('#erase', 300);
await shot(`${NAME}-erase-after.png`);
await wait(1100);

await caption('Undo: the changed cell pulses, digits fade in / out');
await tap(cell(40), 500);
await tap('#undo', 0);
await wait(60);
await shot(`${NAME}-undo-anim.png`);
await wait(1200);
await tap('#undo', 1300);

await caption('Quick back-to-back swipes');
await tap(cell(65), 400);
const quick = { ms: 130, pre: 30, hold: 20, after: 90 };
for (const d of [1, 6, 8, 1, 9, 6, 8, 1]) await swipe(key(d), 58, quick);
await wait(1000);

await caption('Double-tap a single-candidate cell → fills it');
await tap(cell(55), 110);
await tap(cell(55), 500);
await shot(`${NAME}-double-tap-fill.png`);
await wait(800);
await caption('Double-tap a cell with several candidates → just selects');
await tap(cell(36), 110);
await tap(cell(36), 1300);

await caption('Fill a few cells: every single-candidate cell flashes together');
for (const [i, d] of [[5, 5], [11, 9], [27, 6], [18, 1]]) {
  await tap(cell(i), 250);
  await tap(key(d), 350);
}
await page.waitForFunction(() => document.querySelectorAll('.n.lone-flash').length >= 2);
await wait(350);
await shot(`${NAME}-synced-flash.png`);
await wait(1600);

await caption('Undo, undo');
await tap('#undo', 1100);
await tap('#undo', 1300);

await caption('Pause: timer stops, board hidden, input blocked');
await tap('#pause', 500);
await shot(`${NAME}-paused.png`);
await tap(key(5), 1200);
await caption('Resume continues the same time');
await tap('#resume', 1300);

await caption('Manual notes: cue setting greyed out, no flashes');
await tap('#notes-mode', 600);
await tap('#more', 500);
await shot(`${NAME}-manual-setting-disabled.png`);
await wait(1500);
await tap('#sheet-close', 500);
await caption('Manual: double-tap only selects');
await tap(cell(7), 110);
await tap(cell(7), 1300);
await caption('');
await wait(300);

await finish();
