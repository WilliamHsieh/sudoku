# Sudoku

A daily Sudoku where pencil marks get as much care as answers.

**[Play it →](https://williamhsieh.github.io/sudoku/)**

Appearance follows your system by default. During a puzzle, open **More → Appearance** to choose
**System**, **Light**, or **Dark**. Your choice is saved on this device.

https://github.com/user-attachments/assets/710dc796-4721-42ac-8d1d-6b18db8ff009

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
