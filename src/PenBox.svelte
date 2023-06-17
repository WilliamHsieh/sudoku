<script>
  import { puzzle, conflictCell } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
</script>

<div class="pen-box">
  {$puzzle[x][y]}
  <div class:conflict={$conflictCell[x][y]}></div>
</div>

<style>
  .pen-box {
    width: 100%;
    height: 100%;
    font-size: 30px;
    position: relative;
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .conflict {
    position: absolute;
    width: 8px;
    height: 8px;
    right: 4px;
    bottom: 4px;
    border-radius: 50%;
    background-color: #ff4b56;
  }
</style>
