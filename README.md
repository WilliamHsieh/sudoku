# Sudoku

A daily Sudoku where pencil marks get as much care as answers. New Easy, Medium and Hard puzzles every day from The New York Times, played with a mouse, a keyboard or your phone.

**[Play it →](https://williamhsieh.github.io/sudoku/)**

![Solving a few moves of today's puzzle on desktop, including one stroke that paints a candidate across a row](https://github.com/user-attachments/assets/73cf9b56-8b59-46de-b596-73bd55a873bc)

## Features

<table>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/bdfc251e-4f6c-4b41-bc63-f2be790bdac4" width="360" alt="Desktop: Shift+4 locks the digit, one drag adds 4 across a row, a second drag removes it"><br>
<img src="https://github.com/user-attachments/assets/21739b21-713f-4cf3-b514-0f78cf648efb" width="360" alt="Phone: holding the 4 key while a second finger paints 4 into several cells">
</td>
<td valign="top">
<h3>Paint your candidates</h3>
<p>Lock a digit with <code>Shift</code> + the digit, then drag across the board. The first cell you touch decides whether the stroke adds that candidate or removes it, and every cell you cross does the same. One Undo takes back the whole stroke. Painting only changes pencil marks. It never enters an answer, and it skips givens and filled cells.</p>
<p>On a phone, hold a keypad digit and paint with a second finger. Candidates about to be added show in blue and ones about to be removed show as a red ghost. Cells that can't take the digit stay unmarked.</p>
</td>
</tr>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/8c37d56b-e58c-482d-b516-4ca21ee19a5d" width="360" alt="The same board in Auto, Tidy and Manual, side by side">
</td>
<td valign="top">
<h3>Notes, three ways</h3>
<p>A small pencil button switches between three modes:</p>
<ul>
<li><b>Auto</b> fills in candidates and keeps them up to date as you place answers. A candidate you remove stays removed. Candidates are worked out from what you've entered, mistakes included, so the board never hints at where you went wrong.</li>
<li><b>Tidy</b> starts blank and the notes are yours. When you place an answer, that digit is cleared from your notes in its row, column and box.</li>
<li><b>Manual</b> leaves everything to you.</li>
</ul>
<p>New puzzles start in Auto.</p>
</td>
</tr>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/f131bb61-717b-4129-8e4e-051d8d0e6efd" width="360" alt="Phone keypad: swiping up on 4 adds a candidate, then swiping down locks it">
</td>
<td valign="top">
<h3>A keypad you can gesture on</h3>
<p>On a phone, every keypad digit does four things. Tap it to highlight that digit and its candidates, or double-tap it to fill the selected cell. Swipe up to toggle the candidate, or swipe down to lock the digit for painting.</p>
</td>
</tr>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/a1f6ecc5-213c-44ac-bcb9-1e895d55785a" width="360" alt="The header on desktop and phone: date and difficulty on the left, the timer and pause control on the right">
</td>
<td valign="top">
<h3>The date takes you out, the timer brings you back</h3>
<p>The header is built around two controls. Tap the puzzle's date and difficulty to open the Journal on that day. The timer doubles as the pause button. From the Journal, it takes you back to your game just as you left it, with the clock and undo history intact.</p>
</td>
</tr>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/2499f8b5-420f-4ee9-883f-fb7a466dadeb" width="360" alt="Journal on desktop: calendar with solved, in-progress and unsolved marks, with stats and a streak"><br>
<img src="https://github.com/user-attachments/assets/ad902e40-2376-4783-9906-3dfbe29598ba" width="360" alt="Journal on phone: the Latest puzzles card with an Unfinished link">
</td>
<td valign="top">
<h3>The Journal</h3>
<p>Every day is on a calendar, with one mark each for Easy, Medium and Hard. <b>Latest puzzles</b> opens the most recent day that has puzzles, and unfinished games get their own list. You also get a streak, monthly counts, and best and average times for each difficulty. A streak counts the puzzle days where you solved at least one puzzle. Days that have no puzzles don't break it.</p>
</td>
</tr>
<tr>
<td width="380" valign="top">
<img src="https://github.com/user-attachments/assets/e39852f1-be47-4a0c-a4c0-431c569424c3" width="360" alt="Returning to a paused puzzle: the cover holds, then the board fades in">
</td>
<td valign="top">
<h3>Small things</h3>
<ul>
<li>When you come back to a paused puzzle, the board waits a moment, then fades in as the blur clears. With reduced motion turned on, it comes back instantly.</li>
<li>Updates apply when you open the app, before you start playing, and never in the middle of a game. If a new version arrives while you're playing, a short notice says it will apply next time.</li>
</ul>
</td>
</tr>
</table>

## The basics

- **Mouse:** click a candidate to toggle it, shift-click it to enter it as the answer, and right-click to clear a cell.
- **Keyboard:** press `1`–`9` to enter an answer and `0` to clear it. Arrows move the selection, `Ctrl/Cmd + Z` undoes, and `P` pauses.
- **Your own puzzle:** add `?q=` and 81 digits (row by row, `0` for blank) to the URL, like [this one](https://williamhsieh.github.io/sudoku/?q=947053100350004097000007350095020071170095003000080005000500700031600402729100030).
- **Progress** is saved in your browser on this device. There are no accounts.

## Development

```sh
npm install
npm run dev     # http://localhost:8000/sudoku/
npm test        # Vitest, then Playwright
```

You'll need Node 22. Run `npx playwright install --with-deps chromium webkit` once for the end-to-end tests. `npm run check`, `npm run lint` and `npm run format` cover the rest.

Puzzles come from `scraper.py`, which a GitHub Action runs daily at 04:00 UTC (`uv run python scraper.py` to run it yourself). Every push to `master` deploys to GitHub Pages.

## License

[MIT](LICENSE). Puzzles come from The New York Times Sudoku page. This project isn't affiliated with The New York Times.
