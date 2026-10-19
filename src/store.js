import { writable } from "svelte/store";

// Timer stays a store so Timer.svelte can keep using `$timer`.
// Solved + in-progress journal history live in src/journal/progress.js.

export let done = writable(false);

export let timer = writable(0);
export let timerRunning = writable(true);

export { solvedPuzzles, puzzleProgress } from "./journal/progress.js";

export function resetTimer() {
  timer.set(0);
  timerRunning.set(true);
}

export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}
