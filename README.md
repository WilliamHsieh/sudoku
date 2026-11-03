# Sudoku

A daily Sudoku where pencil marks get as much care as answers.

**[Play it →](https://williamhsieh.github.io/sudoku/)**

Appearance follows your system by default. During a puzzle, open **More → Appearance** to choose
**System**, **Light**, or **Dark**. Your choice is saved on this device.

Open **Custom puzzle** from the home screen or **More → Custom puzzle** while playing.
Enter givens on the board, paste 81 digits (`0` for blanks), or paste a puzzle link.
**Copy puzzle** offers an 81-digit copy dialog and link sharing. Shared links open a preview;
press **Start puzzle** to play.

https://github.com/user-attachments/assets/710dc796-4721-42ac-8d1d-6b18db8ff009

## Development

```sh
npm install
npm run dev     # http://localhost:8000/sudoku/
npm test        # Vitest, then Playwright
```

You'll need Node 22. Run `npx playwright install --with-deps chromium webkit` once for the end-to-end tests. `npm run check`, `npm run lint` and `npm run format` cover the rest.

The hint UI can be reviewed with fixed, validated examples without a server or solver:

```sh
npm run mock:hint          # Open the existing App with a fixture hint provider
npm run mock:hint:check    # Chromium/WebKit layout and interaction checks
npm run mock:hint:capture  # Desktop/phone screenshots and MP4 recordings (requires ffmpeg)
```

These commands write local artifacts to `.lavish/hint-ui-implemented/`. The production App runs a local Web Worker hint provider; the fixture provider is not included in its bundle. No server or Java runtime is needed. The supported order is singles, pairs, intersections, triples, X-Wing, Chute Remote Pair, XY/W-Wing, simple colouring, quads, Swordfish, XYZ-Wing, Jellyfish, and finned X-Wing/Swordfish (standard finned forms, not sashimi). Each detected teaching step is independently checked against all possible completions before display. A bounded proof check or 3-second Worker timeout fails closed; it does not offer an unverified step.

Trusted eliminations are saved separately from player notes. They are structurally validated on load and independently re-proved before search, follow undo/redo, and reset on manual answer edits. Incomplete pencil marks never become reasoning premises. Closing, changing the board, pausing, or hiding the page cancels pending work. This implementation searches on request only; it does not claim background precomputation or offline PWA caching.

Puzzles come from `scraper.py`, which a GitHub Action runs daily at 04:00 UTC (`uv run python scraper.py` to run it yourself). Every push to `master` deploys to GitHub Pages.

## License

[MIT](LICENSE). Puzzles come from The New York Times Sudoku page. This project isn't affiliated with The New York Times.
