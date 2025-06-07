<script>
  import {
    pencilBox,
    userRemovePencil,
    puzzle,
    focusedCellId,
    cellUpdate,
  } from "./store";

  export let cell_id;
  export let idx;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;

  let isShiftPressed = false;

  function handleClick(e) {
    // TODO: shift click anywhere to auto complete the cell if there's only on pencil mark left
    if (e.shiftKey) {
      $puzzle[x][y] = idx + 1;
    } else if ($focusedCellId == cell_id) {
      $userRemovePencil[x][y][idx] = !$userRemovePencil[x][y][idx];
    }
    $cellUpdate = true;
  }

  function handleKeyDown(e) {
    if (e.key === "Shift") {
      isShiftPressed = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === "Shift") {
      isShiftPressed = false;
    }
  }

  $: isSelected = $focusedCellId === cell_id;
</script>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

<div
  class="pencil-box"
  class:invisible={!$pencilBox[x][y][idx] || $userRemovePencil[x][y][idx]}
  class:selected={isSelected}
  class:shift-hover={isShiftPressed}
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

  .invisible {
    color: transparent !important;
  }
</style>
