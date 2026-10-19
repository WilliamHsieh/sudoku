import { writable } from "svelte/store";

// Timer and solved-history stay as stores so Timer.svelte and Calendar.svelte
// (legacy syntax) can keep using `$timer` / `$solvedPuzzles`. Board state lives
// in src/game/game.svelte.js.

export let done = writable(false);

// Timer state
export let timer = writable(0);
export let timerRunning = writable(true);

// Solved puzzles tracking
function createSolvedPuzzles() {
  // Load from localStorage
  const stored = typeof window !== "undefined" ? localStorage.getItem("sudoku-solved") : null;

  const initial = stored ? JSON.parse(stored) : {};

  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    markSolved: (dateStr, difficulty, completionTime) => {
      update((solved) => {
        if (!solved[dateStr]) solved[dateStr] = {};
        solved[dateStr][difficulty] = {
          completed: true,
          time: completionTime,
          timestamp: Date.now(),
        };

        // Save to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("sudoku-solved", JSON.stringify(solved));
        }

        return solved;
      });
    },
    isSolved: (dateStr, difficulty) => {
      const solved = {};
      subscribe((value) => (solved.current = value))();
      return solved.current?.[dateStr]?.[difficulty]?.completed || false;
    },
  };
}

export const solvedPuzzles = createSolvedPuzzles();

// Helper function to reset timer when loading new puzzle
export function resetTimer() {
  timer.set(0);
  timerRunning.set(true);
}

// Helper function to format time for display
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}
