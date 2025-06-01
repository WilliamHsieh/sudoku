<script>
  import { pencilBox, userRemovePencil, puzzle, focusedCellId, cellUpdate } from './store'

  export let cell_id;
  export let idx;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;

  function handleClick(e) {
    // TODO: shift click anywhere to auto complete the cell if there's only on pencil mark left
    if (e.shiftKey) {
      $puzzle[x][y] = idx + 1;
    } else if ($focusedCellId == cell_id) {
      $userRemovePencil[x][y][idx] = !$userRemovePencil[x][y][idx];
    }
    $cellUpdate = true;
  }

  $: isSelected = $focusedCellId === cell_id;
</script>

<div
  class="pencil-box"
  class:invisible={!$pencilBox[x][y][idx] || $userRemovePencil[x][y][idx]}
  class:selected={isSelected}
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
    color: #6b7280;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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

  .invisible {
    color: transparent !important;
  }
</style>
