<script>
  import Api from './Api.svelte';
  import Cell from './Cell.svelte';
  import { puzzle, focusedCellId, cellUpdate, prefilled } from './store'

  function handleKeydown(event) {
    const x = Math.floor($focusedCellId / 9);
    const y = $focusedCellId % 9;
    if ($prefilled[x][y]) return;

    const k = event.key;
    if (k >= '0' && k <= '9') {
      $puzzle[x][y] = k;
      $cellUpdate = true;
    }
  }
</script>

<svelte:window on:keydown={handleKeydown}/>

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main>
  <Api />
  <h1>Sudoku</h1>
  <div class="board">
    {#each Array(9) as _, row}
      {#each Array(9) as _, col}
        <Cell cell_id={row * 9 + col} />
      {/each}
    {/each}
  </div>
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
