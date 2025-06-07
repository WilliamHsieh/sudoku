<script>
  import {
    pencilBox,
    userRemovePencil,
    puzzle,
    focusedCellId,
    cellUpdate,
  } from "./store";
  import { onDestroy } from "svelte";

  export let cell_id;
  export let idx;
  export let isShiftPressed = false;
  export let isClosest = false;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;

  let localShiftPressed = false;

  // Clean up timers when component is destroyed
  onDestroy(() => {
    clearTimers();
  });

  function handleClick(e) {
    // TODO: shift click anywhere to auto complete the cell if there's only on pencil mark left
    if (e.shiftKey) {
      // Only fill if this pencil mark is actually visible (possible to fill)
      if ($pencilBox[x][y][idx] && !$userRemovePencil[x][y][idx]) {
        $puzzle[x][y] = idx + 1;
        $cellUpdate = true;
      }
    } else if ($focusedCellId == cell_id) {
      $userRemovePencil[x][y][idx] = !$userRemovePencil[x][y][idx];
      $cellUpdate = true;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Shift") {
      localShiftPressed = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === "Shift") {
      localShiftPressed = false;
    }
  }

  $: isSelected = $focusedCellId === cell_id;
  $: showShiftCursor = isShiftPressed || localShiftPressed;

  let isMatchingNumber = false;
  let isOnlyCandidate = false;
  let showOnlyCandidateHint = false;
  let hintTimer = null;

  function startHintCycle() {
    clearTimers();
    startRepeatingCycle();
  }

  function startRepeatingCycle() {
    hintTimer = setTimeout(() => {
      showHint();
      startRepeatingCycle();
    }, 15000);
  }

  function showHint() {
    showOnlyCandidateHint = true;
    // Hide after 1.5 second
    setTimeout(() => {
      showOnlyCandidateHint = false;
    }, 1500);
  }

  function clearTimers() {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    showOnlyCandidateHint = false;
  }

  $: {
    // Highlight pencil marks that match the focused cell's number
    let focusedCellNumber = 0;

    if ($focusedCellId !== -1) {
      const focusedX = Math.floor($focusedCellId / 9);
      const focusedY = $focusedCellId % 9;
      focusedCellNumber = $puzzle[focusedX][focusedY];
    }

    // Only highlight if:
    // 1. Selected cell has a number
    // 2. This pencil mark shows that same number
    // 3. This pencil mark is actually visible
    isMatchingNumber =
      focusedCellNumber !== 0 &&
      idx + 1 === focusedCellNumber &&
      $pencilBox[x][y][idx] &&
      !$userRemovePencil[x][y][idx];

    // Check if this is the only candidate left in this cell
    let wasOnlyCandidate = isOnlyCandidate;

    if ($puzzle[x][y] === 0) {
      // Only for empty cells
      let visibleCandidates = 0;
      for (let i = 0; i < 9; i++) {
        if ($pencilBox[x][y][i] && !$userRemovePencil[x][y][i]) {
          visibleCandidates++;
        }
      }
      isOnlyCandidate =
        visibleCandidates === 1 &&
        $pencilBox[x][y][idx] &&
        !$userRemovePencil[x][y][idx];
    } else {
      isOnlyCandidate = false;
    }

    // Start hint cycle when becoming only candidate
    if (isOnlyCandidate && !wasOnlyCandidate) {
      startHintCycle();
    }
    // Clear timers when no longer only candidate
    else if (!isOnlyCandidate && wasOnlyCandidate) {
      clearTimers();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

<div
  class="pencil-box"
  class:invisible={!$pencilBox[x][y][idx] || $userRemovePencil[x][y][idx]}
  class:selected={isSelected}
  class:shift-hover={showShiftCursor}
  class:snapped={isClosest && showShiftCursor}
  class:matching-number={isMatchingNumber}
  class:only-candidate={showOnlyCandidateHint}
  on:click={handleClick}
>
  {idx + 1}
</div>

<style>
  .pencil-box {
    font-size: 0.9rem;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 500;
    color: #9ca3af;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    transition: all 0.15s ease;
    cursor: pointer;
    border-radius: 2px;
    min-height: 20px;
  }

  .pencil-box.selected {
    color: white;
  }

  .pencil-box:hover {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }

  .pencil-box.selected:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .pencil-box.shift-hover {
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M8 2v12M2 8h12' stroke='%23374151' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")
        8 8,
      crosshair;
  }

  .pencil-box.shift-hover:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M8 2v12M2 8h12' stroke='%23ef4444' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")
        8 8,
      crosshair;
  }

  .pencil-box.snapped {
    background: rgba(34, 197, 94, 0.2) !important;
    color: #22c55e !important;
    transform: scale(1.1);
    border: 1px solid #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
    z-index: 10;
    position: relative;
  }

  .pencil-box.matching-number {
    background: rgba(253, 230, 138, 0.3);
    color: #b45309;
    border: 1px solid rgba(253, 230, 138, 0.6);
    border-radius: 3px;
  }

  .pencil-box.matching-number.selected {
    background: rgba(253, 230, 138, 0.15);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(253, 230, 138, 0.4);
  }

  .pencil-box.only-candidate {
    background: rgba(34, 197, 94, 0.2);
    color: #15803d;
    border: 2px solid #22c55e;
    border-radius: 4px;
    font-weight: 600;
    animation: pulse-glow 2s ease-in-out infinite;
    position: relative;
    z-index: 5;
  }

  .pencil-box.only-candidate.selected {
    background: rgba(34, 197, 94, 0.15);
    color: rgba(255, 255, 255, 0.95);
    border: 2px solid rgba(34, 197, 94, 0.6);
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.3);
    }
    50% {
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
    }
  }

  .invisible {
    color: transparent !important;
  }
</style>
