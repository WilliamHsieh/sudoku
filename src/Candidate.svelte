<script>
  import PencilBox from './PencilBox.svelte';

  export let cell_id;
</script>

<div class="cell">
  {#each Array(9) as _, x}
    <PencilBox
      cell_id = {cell_id}
      idx = {x}
    />
  {/each}
</div>

<style>
  .cell {
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, auto);
    grid-auto-rows: auto;
  }
</style>
