// Records the main human-paced demo (v1 flow).
// Usage: node scripts/record.mjs [outDir]   (server must be running on :5180)
import { join } from 'node:path';
import { openDemo } from './demo-kit.mjs';

const OUT = process.argv[2] || 'recordings';
const { page, wait, caption, cell, key, tap, swipe, finish } = await openDemo({
  url: process.env.URL || 'http://localhost:5180/?cueMs=3000',
  out: OUT,
  name: 'mobile-input-opus',
});

await wait(400);
await caption('Tap a cell to select it');
await tap(cell(75), 900);

await caption('Tap 9 → writes the answer');
await tap(key(9), 1000);
await caption('Tap 9 again → clears it');
await tap(key(9), 1000);

await caption('Swipe up on a key → add candidate');
await swipe(key(1), 70);
await swipe(key(3), 75, { shot: join(OUT, 'mobile-input-opus-armed-swipe.png') });
await swipe(key(9), 70, { after: 900 });

await caption('Swipe the same key again → remove candidate');
await swipe(key(3), 72, { hold: 300, after: 1000 });

await caption('Short drag below threshold → glides back, nothing written');
await swipe(key(7), 17, { ms: 300, hold: 450, after: 1200 });

await caption('Two candidates left (1, 9). Remove 1 → only 9 remains');
await swipe(key(1), 72, { after: 1200 });

await caption('Create a conflict: 9 in a row that already has 9');
await tap(cell(7), 700);
await tap(key(9), 600);
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
await tap(cell(16), 700);
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

await caption('Swipe works in Auto mode too: remove 2 from r4c1');
await tap(cell(27), 700);
await swipe(key(2), 72, { after: 1200 });

await caption('Undo, undo');
await tap('#undo', 900);
await tap('#undo', 1200);

await caption('Back to Manual notes');
await tap('#notes-mode', 1200);
await caption('');
await wait(300);

await finish();
