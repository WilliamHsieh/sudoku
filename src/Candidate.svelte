<script>
  export let cell_id;
</script>

<div class="cell">
  {#each Array(3) as _, row}
    {#each Array(3) as _, col}
      <div class="candidate">
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
