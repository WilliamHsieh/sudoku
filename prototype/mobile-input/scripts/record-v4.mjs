// Records the v4 demo: two-step undo / redo and the highlighted-digit double-tap fill.
// Usage: node scripts/record-v4.mjs [outDir]   (server must be running on :5180)
import { openDemo } from './demo-kit.mjs';

const OUT = process.argv[2] || 'recordings';
const NAME = 'v4-undo-redo';
const { wait, caption, cell, key, tap, finish } = await openDemo({
  url: process.env.URL || 'http://localhost:5180/',
  out: OUT,
  name: NAME,
});

const doubleTap = async (sel, after = 1300) => {
  await tap(sel, 110);
  await tap(sel, after);
};

await wait(400);
await caption('Notes: Auto');
await tap('#notes-mode', 600);
await caption('Fill two cells');
await tap(cell(62), 350);
await tap(key(4), 600);
await tap(cell(70), 350);
await tap(key(3), 900);

await caption('Undo: a ring lands on the cell, then the change applies');
await tap('#undo', 1300);
await tap('#undo', 1500);
await caption('Redo plays the same two steps');
await tap('#redo', 1300);
await tap('#redo', 1500);
await caption('Undo, redo again');
await tap('#undo', 1300);
await tap('#redo', 1500);

await caption('A new edit clears redo');
await tap('#undo', 1200);
await tap(cell(21), 350);
await tap(key(3), 1600);

await caption('Highlight 5, then double-tap a cell with 5 as a candidate');
await tap(cell(0), 1000);
await doubleTap(cell(37), 1600);
await caption('No highlighted digit: double-tap fills a lone candidate');
await tap(cell(2), 800);
await doubleTap(cell(59), 1600);
await caption('');
await wait(600);

await finish();
