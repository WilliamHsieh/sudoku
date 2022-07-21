<script>
  import Cell from './Cell.svelte';
  import { puzzle, conflictCell, shouldCheck } from './store'

  $: if ($shouldCheck) {
    checkConflict();
    $shouldCheck = false;
  }

  function checkConflict() {
    // row
    for (let i = 0; i < 9; i++) {
      let mp = Array(10).fill(0);
      for (let j = 0; j < 9; j++) {
        mp[$puzzle[i][j]] += 1;
      }
      for (let j = 0; j < 9; j++) {
        $conflictCell[i][j] = $puzzle[i][j] > 0 && mp[$puzzle[i][j]] > 1;
      }
    }

    // column
    for (let j = 0; j < 9; j++) {
      let mp = Array(10).fill(0);
      for (let i = 0; i < 9; i++) {
        mp[$puzzle[i][j]] += 1;
      }
      for (let i = 0; i < 9; i++) {
        if ($puzzle[i][j] > 0 && mp[$puzzle[i][j]] > 1) {
          $conflictCell[i][j] = true;
        }
      }
    }

    // block
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(i / 3) * 3;
      const y = (i % 3) * 3;
      let mp = Array(10).fill(0);
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          mp[$puzzle[x + dx][y + dy]] += 1;
        }
      }
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          let xx = x + dx, yy = y + dy;
          if ($puzzle[xx][yy] > 0 && mp[$puzzle[xx][yy]] > 1) {
            $conflictCell[xx][yy] = true;
          }
        }
      }
    }
  }
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
