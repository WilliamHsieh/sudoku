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
