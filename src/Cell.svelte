<script>
  import Candidate from './Candidate.svelte';
  import PenBox from './PenBox.svelte';
  import { onMount } from 'svelte';
  import { puzzle, userRemovePencil, focusedCellId, prefilled, cellUpdate } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
  let style = "cell";

  $: filled = $puzzle[x][y] != 0;
  $: cellStyle = () => {
    let fg = "black";
    let bg = "white";

    if ($prefilled[x][y]) bg = "#e6e6e6";
    if (filled && $focusedCellId != -1 && $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] == $puzzle[x][y]) {
      bg = "#ffef5c";
    }
    if ($focusedCellId == cell_id) {
      bg = "#087da1";
      fg = "white";
    }

    return `background-color: ${bg}; color: ${fg}`;
  };

  onMount(() => {
    if (x % 3 == 0) style += " top-wall";
    if (y % 3 == 0) style += " left-wall";
    if (x == 8 && (x + 1) % 3 == 0) style += " bottom-wall";
    if (y == 8 && (y + 1) % 3 == 0) style += " right-wall";
  })

  function handleRightClick() {
    if ($focusedCellId == cell_id) {
      $userRemovePencil[x][y].fill(false);
      $puzzle[x][y] = 0;
      $cellUpdate = true;
    }
  }

  function handleClick() {
    $focusedCellId = cell_id;
  }
</script>

<div class={style} on:click={handleClick} on:contextmenu|preventDefault={handleRightClick} style={cellStyle()}>
  {#if filled}
    <PenBox cell_id={cell_id} />
  {:else}
    <Candidate cell_id={cell_id} />
  {/if}
</div>

<style>
  .cell {
    width: 51px;
    height: 51px;
    border-top: 1px solid black;
    border-left: 1px solid black;
  }

  .top-wall { border-top: 3px solid black; }
  .bottom-wall { border-bottom: 3px solid black; }
  .left-wall { border-left: 3px solid black; }
  .right-wall { border-right: 3px solid black; }
</style>
