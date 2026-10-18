# Mobile input prototype

Standalone, dependency-free (plain HTML/CSS/JS) prototype of the mobile Sudoku
input model. It does not touch the main app.

- Tap a key: write that digit as the answer (tap the same key again to clear).
- Swipe up on a key (~28px arms, below ~22px disarms): toggle that digit as a
  candidate in the selected cell.
- Tools: Undo, Erase, Notes Auto/Manual switch, More (single-candidate cue setting).
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
npm run record       # writes recordings/mobile-input-opus.webm + screenshots
```
