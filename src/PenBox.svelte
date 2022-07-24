<script>
  import { puzzle, focusedCellId, conflictCell, prefilled } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;

  $: conflicted = $conflictCell[x][y];

  $: cell_color = () => {
    let res = "white";
    if ($prefilled[x][y]) res = "#e6e6e6";
    if ($focusedCellId != -1 && $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] == $puzzle[x][y]) {
      res = "#ffef5c";
    }
    if ($focusedCellId == cell_id) res = "#087da1; color: white";
    return "background-color:" + res;
  }
</script>

<div class="pen-box" style={cell_color()}>
  {$puzzle[x][y]}
  <div class:conflicted></div>
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

  .conflicted {
    position: absolute;
    width: 8px;
    height: 8px;
    right: 4px;
    bottom: 4px;
    border-radius: 50%;
    background-color: #ff4b56;
  }
</style>
