# Sudoku
A mouse-centric Sudoku front-end UI developed with [`Svelte.js`](https://github.com/sveltejs/svelte).
- https://williamhsieh.github.io/sudoku/

## Usage
To use the Sudoku application, follow these steps:

1. Click on any box within the grid to highlight the relevant information.
2. Once a box is highlighted, you can perform the following actions:
    - To remove a pencil mark, simply **left-click** on it.
    - To input the answer, either use the number pad or perform a **shift-left click** on the candidate pencil mark.
    - If you need to delete a filled box, type in 0 or **right-click** with cursor.
    - To clear the highlight, click on the title "Sudoku".
3. Additionally, you can set up a new Sudoku grid by utilizing a query string. For example:
    - Visit the following URL: https://williamhsieh.github.io/sudoku/?q=947053100350004097000007350095020071170095003000080005000500700031600402729100030
    - Please note that the provided URL demonstrates how to create a new Sudoku grid using a query string.

## Automatic code updates

Production builds include `version.json`, a build identity in HTML and JavaScript,
and hashes of the HTML, JavaScript and CSS. On launch and foreground return, the
app checks for a newer deployment. It verifies the deployment, waits until input
ends, confirms saved Journal data and preferences, and saves the current puzzle
and undo/redo history before navigating automatically. There is no update button.

Failed checks or writes leave the current app open. Checks are throttled to 30
seconds; a tab attempts each target build only once to prevent stale-HTML loops.
The updater uses the Vite base path, including `/sudoku/` on GitHub Pages.

Run `npm run test:upgrade` for the two-production-build tests in Chromium,
Chromium mobile emulation and WebKit. Install browsers with
`npx playwright install --with-deps chromium webkit` first.

This starts working after a page has loaded a release containing the updater.
It does not require deleting and reinstalling the home-screen app. It does not
control iOS icons or protect local records from removal of website data or OS
storage eviction. The existing offline behavior is unchanged.
