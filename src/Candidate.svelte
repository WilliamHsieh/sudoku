<script>
  import PencilBox from './PencilBox.svelte';
  import { focusedCellId } from './store'

  export let cell_id;

  $: cell_color = $focusedCellId == cell_id ? "color: black; background: #ffef5c" : "color: gray";
</script>

<div class="cell" style={cell_color}>
  {#each Array(9) as _, x}
    <PencilBox
      cell_id = {cell_id}
      number = {x}
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
