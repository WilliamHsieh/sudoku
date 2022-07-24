<script>
  import { pencilBox, userRemovePencil, puzzle, focusedCellId, cellUpdate } from './store'

  export let cell_id;
  export let idx;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;

  $: invisiblePencil = !$pencilBox[x][y][idx] || $userRemovePencil[x][y][idx];

  function handleClick(event) {
    if (event.shiftKey) {
      $puzzle[x][y] = idx + 1;
    } else if ($focusedCellId == cell_id) {
      $userRemovePencil[x][y][idx] = !$userRemovePencil[x][y][idx];
    }
    $cellUpdate = true;
  }
</script>

<div class="candidate" class:invisiblePencil on:click|preventDefault={handleClick}>
  {idx + 1}
</div>

<style>
  .candidate {
    font-size: 33.3%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .invisiblePencil {
    color: transparent;
  }
</style>
