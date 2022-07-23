<script>
  import { focusedCellId, pencilBox } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
</script>

<div class="cell" style={$focusedCellId == cell_id ? "color:white" : "color:gray"}>
  {#each Array(3) as _, row}
    {#each Array(3) as _, col}
      <div class="candidate" style={$pencilBox[x][y][row * 3 + col] ? "" : "visibility:hidden"}>
        {row * 3 + col + 1}
      </div>
    {/each}
  {/each}
</div>

<style>
  .candidate {
    font-size: 1px;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .cell {
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, auto);
    grid-auto-rows: auto;
  }
</style>
