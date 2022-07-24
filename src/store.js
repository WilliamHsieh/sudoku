import { writable, derived } from "svelte/store";

export let focusedCellId = writable(-1)
export let cellUpdate = writable(true);
export let conflictCell = writable([...Array(9)].map(_ => Array(9).fill(false)));
export let prefilled = writable([...Array(9)].map(_ => Array(9).fill(false)));
export let pencilBox = writable([...Array(9)].map(_ => [...Array(9)].map(_ => Array(9).fill(true))));
export let userRemovePencil = writable([...Array(9)].map(_ => [...Array(9)].map(_ => Array(9).fill(false))));

export let puzzle = writable([
  [0, 5, 0, 9, 0, 0, 0, 0, 0],
  [8, 0, 0, 0, 4, 0, 3, 0, 7],
  [0, 0, 0, 2, 8, 0, 1, 9, 0],
  [5, 3, 8, 6, 0, 7, 9, 4, 0],
  [0, 2, 0, 3, 0, 1, 0, 0, 0],
  [1, 0, 9, 8, 0, 4, 6, 2, 3],
  [9, 0, 7, 4, 0, 0, 0, 0, 0],
  [0, 4, 5, 0, 0, 0, 2, 0, 9],
  [0, 0, 0, 0, 3, 0, 0, 7, 0],
]);
