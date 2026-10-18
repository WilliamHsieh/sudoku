# Mobile input prototype

Standalone, dependency-free (plain HTML/CSS/JS) prototype of the mobile Sudoku
input model. It does not touch the main app.

- Tap a key: write that digit as the answer (tap the same key again to clear).
- Swipe up on a key (~28px arms, below ~22px disarms): toggle that digit as a
  candidate in the selected cell.
- Tools: Undo (animates the cells it changed), Erase, Notes Auto/Manual switch,
  More (single-candidate cue setting).
- Erase: disabled on givens. Clears the answer first (the cell's notes come back).
  On an empty cell it resets Auto overrides (Auto mode) or clears manual notes
  (Manual mode), never the other mode's set. Disabled when there is nothing to erase.
- Auto notes only: one global clock flashes every single-candidate note for 1.5s
  every 15s (override with `?cueMs=3000` or `window.__sudoku.setCueInterval(ms)`),
  and double-tapping a single-candidate cell fills it.
- Timer with pause/resume; pauses itself when the page is hidden.
- Desktop: click to select, arrows move, `1`-`9` answer, `Shift`+`1`-`9` candidate,
  `0`/`Backspace`/right-click clear, `Ctrl`/`Cmd`+`Z` undo.

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
```
