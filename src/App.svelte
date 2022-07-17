<script>
  import Cell from './Cell.svelte';
</script>

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main>
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
  }
</style>
