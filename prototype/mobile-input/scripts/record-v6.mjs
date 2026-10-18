// Records the v6 demo: the travelling undo/redo ring (near, far, rapid) on the hard puzzle.
// Usage: node scripts/record-v6.mjs [outDir]   (server must be running on :5180)
import { openDemo } from './demo-kit.mjs';

const OUT = process.argv[2] || 'recordings';
const NAME = 'v6-undo-redo';
const { wait, caption, cell, key, tap, finish } = await openDemo({
  url: process.env.URL || 'http://localhost:5180/?cueMs=3600000',
  out: OUT,
  name: NAME,
});

await wait(400);
await caption('Notes: Auto');
await tap('#notes-mode', 600);

await caption('Near undo: the ring travels one cell');
await tap(cell(77), 300);
await tap(key(7), 500);
await tap(cell(76), 600);
await tap('#undo', 1500);

await caption('Far undo: the ring crosses the board, a little slower');
await tap(cell(8), 300);
await tap(key(2), 500);
await tap(cell(72), 600);
await tap('#undo', 1700);

await caption('Fill five cells');
for (const [i, d] of [[36, 3], [45, 2], [47, 9], [33, 4], [2, 3]]) {
  await tap(cell(i), 250);
  await tap(key(d), 400);
}
await wait(500);

await caption('Five quick undos: half-speed rings, nothing skipped');
for (let k = 0; k < 5; k++) await tap('#undo', 90);
await wait(1600);

await caption('Redo, one at a time');
for (let k = 0; k < 3; k++) await tap('#redo', 1200);
await caption('Two quick redos');
await tap('#redo', 90);
await tap('#redo', 1600);
await caption('');
await wait(500);

await finish();
