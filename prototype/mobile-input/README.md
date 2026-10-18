# Mobile input prototype

Standalone, dependency-free (plain HTML/CSS/JS) prototype of the mobile Sudoku
input model. It does not touch the main app. The demo puzzle is NYT Hard
2025-06-01 from the main app's bank (25 givens, one solution, needs more than
singles; checked by `tests/puzzle.spec.mjs`).

- Tap a key: write that digit as the answer (tap the same key again to clear).
- Swipe up on a key (~28px arms, below ~22px disarms): toggle that digit as a
  candidate in the selected cell. Adding a digit that already sits in the cell's
  row, column or box (given or answer) is refused: the lift glides back, nothing is
  written, and the blocking cells flash red-orange. Removing is always allowed, and
  notes made illegal by a later answer are left alone.
- Tools: Undo, Redo, Erase, Notes Auto/Manual switch, More. Undo/redo: a red-orange
  ring travels from the selection to the changed cell (~300ms for a neighbour up to
  ~450ms across the board, 150ms in place), the change applies 200ms after it lands,
  then the ring fades. Repeats during or within ~400ms of one run at half speed.
  Same-digit highlights stay off until the last ring is gone, then fade back in.
- Erase: disabled on givens. Clears the answer first (the cell's notes come back).
  On an empty cell it resets Auto overrides (Auto mode) or clears manual notes
  (Manual mode), never the other mode's set. Disabled when there is nothing to erase.
- Auto notes only: one global clock flashes every single-candidate note for 1.5s
  every 30s (override with `?cueMs=3000` or `window.__sudoku.setCueInterval(ms)`).
  Double-tapping a cell writes the digit that was highlighted before the first tap
  if it is one of the cell's candidates, else the cell's lone candidate.
- Selection: the selected cell stays white with a blue ring; cells with the same
  digit get a yellow tint and matching candidates sit on a pale yellow chip
  (`--same`, `--cand-emph`, `--cand-chip`). Blue is reserved for answers and the ring.
- Timer with pause/resume; pauses itself when the page is hidden.
- Desktop: click to select, arrows move, `1`-`9` answer, `Shift`+`1`-`9` candidate,
  `0`/`Backspace`/right-click clear, `Ctrl`/`Cmd`+`Z` undo,
  `Ctrl`/`Cmd`+`Shift`+`Z` or `Ctrl`+`Y` redo.

## Run

```sh
cd prototype/mobile-input
npm install
npm start            # http://localhost:5180
```

Any static server works too (`python3 -m http.server` from this folder).

## Test

```sh
npx playwright install chromium
npm test
```

## Record the demo video

With `npm start` running in another shell:

```sh
npm run record       # v1 flow: recordings/mobile-input-opus.webm + screenshots
npm run record:v2    # v2 flow: recordings/mobile-input-opus-v2.webm + screenshots
npm run record:v6    # travelling undo/redo ring: recordings/v6-undo-redo.webm
npm run screens:v6   # v6 screenshots into recordings/
```
