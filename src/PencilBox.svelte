<script>
  import { pencilBox } from './store'

  export let cell_id;
  export let number;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
</script>

<div class="candidate" style={$pencilBox[x][y][number] ? "" : "visibility:hidden"}>
  {number + 1}
</div>

<style>
  .candidate {
    font-size: 2vmin;
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
