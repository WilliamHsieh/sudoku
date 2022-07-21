<script>
  import { onMount } from 'svelte';
  import { puzzle, focusedCellId, conflictCell, shouldCheck } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
  const prefilled = $puzzle[x][y] != 0;
  let style = "cell";

  $: conflicted = $conflictCell[x][y];
  $: focused = $focusedCellId == cell_id;
  $: focusedNumber = $focusedCellId != -1
    && $focusedCellId != cell_id
    && $puzzle[x][y] != 0
    && $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] == $puzzle[x][y];

  function handleClick() {
    $focusedCellId = $focusedCellId == cell_id ? -1 : cell_id;
  }

  function handleKeydown(event) {
    const k = event.key;
    if (!prefilled && $focusedCellId == cell_id && k >= '0' && k <= '9') {
      $puzzle[x][y] = k;
      $shouldCheck = true;
    }
  }

  onMount(() => {
    if (x % 3 == 0) style += " top-wall";
    if (y % 3 == 0) style += " left-wall";
    if (x == 8 && (x + 1) % 3 == 0) style += " bottom-wall";
    if (y == 8 && (y + 1) % 3 == 0) style += " right-wall";
  })
</script>

<svelte:window on:keydown={handleKeydown}/>

<div class:prefilled class:focusedNumber class:focused class="{style}" on:click={handleClick}>
  {#if $puzzle[x][y] != 0}
    {$puzzle[x][y]}
  {/if}
  <div class:conflicted></div>
</div>

<style>
  .cell {
    position: relative;
    width: 40px;
    height: 40px;
    font-size: 30px;

    display: flex;
    justify-content: center;
    align-items: center;

    padding: 3px;
    border-top: 1px solid black;
    border-left: 1px solid black;
  }

  .top-wall {
    border-top: 3px solid black;
  }

  .bottom-wall {
    border-bottom: 3px solid black;
  }

  .left-wall {
    border-left: 3px solid black;
  }

  .right-wall {
    border-right: 3px solid black;
  }

  .prefilled {
    background: #e6e6e6;
    font-weight: bold;
  }

  .focused {
    background-color: #087da1;
    color: white;
  }

  .focusedNumber {
    background-color: #ffef5c;
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
