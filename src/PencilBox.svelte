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
</script>

<div
  class="pencil-box"
  class:invisible={!$pencilBox[x][y][idx] || $userRemovePencil[x][y][idx]}
  on:click={handleClick}
>
  {idx + 1}
</div>

<style>
  .pencil-box {
    font-size: 33.3%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .invisible {
    color: transparent;
  }
</style>
