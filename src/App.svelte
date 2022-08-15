<script>
  import Api from './Api.svelte';
  import Cell from './Cell.svelte';
  import Timer from './Timer.svelte';
  import { puzzle, focusedCellId, cellUpdate, prefilled } from './store'

  function handleKeydown(event) {
    if ($focusedCellId == -1) return;
    const x = Math.floor($focusedCellId / 9);
    const y = $focusedCellId % 9;

    if (e.key >= '0' && e.key <= '9' && !$prefilled[x][y]) {
      $puzzle[x][y] = parseInt(e.key, 10);
      $cellUpdate = true;
    } else if (e.key == 'ArrowLeft' && $focusedCellId % 9) {
      $focusedCellId -= 1;
    } else if (e.key == 'ArrowRight' && ($focusedCellId + 1) % 9) {
      $focusedCellId += 1;
    } else if (e.key == 'ArrowUp' && $focusedCellId >= 9) {
      $focusedCellId -= 9;
    } else if (e.key == 'ArrowDown' && $focusedCellId + 9 < 81) {
      $focusedCellId += 9;
    }
  }

  function removeFocus() {
    $focusedCellId = -1;
  }

</script>

<svelte:window on:keydown={handleKeydown}/>

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main>
  <Api />
  <h1 on:click={removeFocus}>Sudoku</h1>
  <div class="board">
    {#each Array(9) as _, row}
      {#each Array(9) as _, col}
        <Cell cell_id={row * 9 + col} />
      {/each}
    {/each}
  </div>

  <Timer />
</main>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(9, auto);
    grid-auto-rows: auto;

    -webkit-user-select:none;
    -moz-user-select:none;
    -o-user-select:none;
    user-select:none;
  }
</style>
