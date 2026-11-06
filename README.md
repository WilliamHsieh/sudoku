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

These commands write local artifacts to `.lavish/hint-ui-implemented/`. The production App runs a local Web Worker hint provider; the fixture provider is not included in its bundle. No server or Java runtime is needed. The supported order is singles, pairs, intersections, triples, X-Wing, Chute Remote Pair, XY/W-Wing, simple colouring, quads, Swordfish, XYZ-Wing, Jellyfish, and finned X-Wing/Swordfish (standard finned forms, not sashimi), followed by twelve bounded phase-three strategies: Rectangle Elimination, X-Cycles, XY-Chain, 3D Medusa, WXYZ-Wing, Aligned Pair Exclusion, Grouped X-Cycles, basic AIC, ALS-XZ, ALS-XY-Wing, Death Blossom, and Sue de Coq. The [exact strategy scope](docs/phase-three-strategies.md) documents supported forms and exclusions; this does not claim every published variant. Each detected teaching step is independently checked against all possible completions of its candidate model before display. A bounded proof check or 3-second Worker timeout fails closed; it does not offer an unchecked step.

Hints are hidden in Manual mode. Auto reasons from the current board and visible Auto candidates, including the player's removals. Those removals are accepted as assumptions, so a mistaken removal can affect a hint. Tidy reasons from the current board and independently certified eliminations; missing pencil marks are not reasoning premises. In both modes an elimination must remove a currently visible candidate. Search skips ineffective pattern instances and keeps looking within the same technique before trying the next one. Placements can still fill an empty cell whose digit was not pencilled in. Closing an effective hint without changing the board may show it again on the next request.

Tidy's trusted eliminations are saved separately from player notes. They are structurally validated on load and independently re-proved before search, follow undo/redo, and reset on manual answer edits. Auto progress stays in its candidate overrides and never promotes player assumptions into Tidy's trusted ledger. Re-adding an eliminated candidate makes that deduction eligible again. Applying an already absent elimination creates no hidden ledger-only move or undo entry. Hint highlights preserve the player's visible notes rather than replacing them with proof candidates. Closing, changing the board, pausing, or hiding the page cancels pending work. This implementation searches on request only; it does not claim background precomputation or offline PWA caching.

Puzzles come from `scraper.py`, which a GitHub Action runs daily at 04:00 UTC (`uv run python scraper.py` to run it yourself). Every push to `master` deploys to GitHub Pages.

## License

[MIT](LICENSE). Puzzles come from The New York Times Sudoku page. This project isn't affiliated with The New York Times.

## Offline releases

Production startup prepares the complete current NYT bank and the offline shell
before play. A failed download shows Retry. Later launches use the verified local
release, including offline navigation under `/sudoku/`.

The scraper still updates `src/puzzles.js`. The build extracts that data into
`banks/<sha256>.json`; the app JavaScript does not contain the bank. `version.json`
(schema 2) identifies the app build separately and lists SHA-256 digests for the
bank, HTML, JavaScript (including the hint worker), CSS, font, and icons.

Publish the whole `dist` directory together. A foreground check downloads into a
separate release cache, verifies every byte, and rereads the network manifest.
Only then does it write the ready marker and show Update. An unchanged bank is
verified and reused locally. Explicit Update flushes game state, selects the ready
release, and reloads. Background checks never activate or reload a game.

The service worker is a stable release router. Its install/activate lifecycle
claims clients but does not select an app version. Navigation uses the active
release; client pins preserve resources for old running tabs. Verification
requests bypass the worker cache. Failed staging deletes only its own incomplete
cache. Ready releases are retained so old and browser-restored tabs can still
load their assets. Offline caches are scoped to this app; game storage is never
cleared by release installation.
