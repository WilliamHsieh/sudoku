import { writable, derived } from "svelte/store";

// TODO: derive focusedCellId -> focusedX, focusedY

export let done = writable(false);
export let cellUpdate = writable(true);
export let focusedCellId = writable(-1)
export let conflictCell = writable([...Array(9)].map(_ => Array(9).fill(false)));
export let prefilled = writable([...Array(9)].map(_ => Array(9).fill(false)));
export let pencilBox = writable([...Array(9)].map(_ => [...Array(9)].map(_ => Array(9).fill(true))));
export let userRemovePencil = writable([...Array(9)].map(_ => [...Array(9)].map(_ => Array(9).fill(false))));

// Timer state
export let timer = writable(0);
export let timerRunning = writable(true);

// Solved puzzles tracking
function createSolvedPuzzles() {
  // Load from localStorage
  const stored = typeof window !== 'undefined' ? localStorage.getItem('sudoku-solved') : null;
  
  const initial = stored ? JSON.parse(stored) : {};
  
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    set,
    update,
    markSolved: (dateStr, difficulty, completionTime) => {
      update(solved => {
        if (!solved[dateStr]) solved[dateStr] = {};
        solved[dateStr][difficulty] = {
          completed: true,
          time: completionTime,
          timestamp: Date.now()
        };
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('sudoku-solved', JSON.stringify(solved));
        }
        
        return solved;
      });
    },
    isSolved: (dateStr, difficulty) => {
      const solved = {};
      subscribe(value => solved.current = value)();
      return solved.current?.[dateStr]?.[difficulty]?.completed || false;
    }
  };
}

export const solvedPuzzles = createSolvedPuzzles();

// Current puzzle info
export let currentPuzzle = writable({ dateStr: null, difficulty: null });

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

// Helper function to reset timer when loading new puzzle
export function resetTimer() {
  timer.set(0);
  timerRunning.set(true);
}

// Helper function to format time for display
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// 947053100
// 350004097
// 000007350
// 095020071
// 170095003
// 000080005
// 000500700
// 031600402
// 729100030
//
// 947053100350004097000007350095020071170095003000080005000500700031600402729100030
