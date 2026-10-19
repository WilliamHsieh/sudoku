# Mobile input prototype

Standalone, dependency-free (plain HTML/CSS/JS) prototype of the mobile Sudoku
input model. It does not touch the main app. The demo puzzle is NYT Easy
2025-08-05 from the main app's bank (38 givens, one solution, solvable by
singles alone; checked by `tests/puzzle.spec.mjs`).

- Tap a key: write that digit as the answer (tap the same key again to clear).
- Swipe up on a key (~28px arms, below ~22px disarms): toggle that digit as a
  candidate in the selected cell. Adding a digit that already sits in the cell's
  row, column or box (given or answer) is refused: while dragging, the key reads
  "Not allowed", no ghost appears and the blocking cells stay tinted red-orange; on
  release the lift glides back, nothing is written, and the blockers flash. Removing is always allowed, and
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
- Givens are weight 700 on `--given-bg`; answers are the same `--ink` at weight 400
  on `--board-bg`. Selection: `--sel-bg` under a `--sel-ring`. Same-digit cells use
  `--same-digit`, or `--same-digit-given` on givens. Matching candidates sit on a
  `--chip-*` tile. Candidates are `--cand` on white and `--cand-on-selected` on the
  fill. Conflict, refusal and the undo ring use `--conflict-*` and `--undo-ring`.
  Notes switch: `--switch-on` / `--switch-off` (blue is only the selection ring).
  All colours, sizes and fonts live in one `:root` token block.
- Timer with pause/resume; pauses itself when the page is hidden.
- Desktop: click to select, arrows move, `1`-`9` answer, `Shift`+`1`-`9` candidate,
  `0`/`Backspace`/right-click clear, `Ctrl`/`Cmd`+`Z` undo,
  `Ctrl`/`Cmd`+`Shift`+`Z` or `Ctrl`+`Y` redo.
- Mouse only (from the main app): click the title to deselect. In the selected empty
  cell, click a candidate's slot to hide it or an empty slot to restore/add it (illegal
  adds are refused). `Shift`+click a visible candidate to enter it. Right-click a
  non-given cell: an answer is cleared together with its Auto overrides; an empty
  cell gets Erase. There is no mouse double-click fill (that is touch only): each click
  is just a click, so a double-click on a slot toggles it twice.
- Shift-hover (mouse only): while `Shift` is held the board shows a crosshair and the
  visible candidate under the pointer, the one `Shift`+click would enter, is drawn in
  bold ink with an ink outline (on a yellow chip, the chip keeps its fill). It follows
  redraws (e.g. `Shift`+digit), and clears on `Shift` up, window blur, leaving the
  board, pause and keypad drags.

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
