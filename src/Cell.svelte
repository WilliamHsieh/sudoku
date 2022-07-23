<script>
  import Candidate from './Candidate.svelte';
  import { onMount } from 'svelte';
  import { puzzle, focusedCellId, conflictCell, cellUpdate } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
  const prefilled = $puzzle[x][y] != 0;
  let style = "cell";

  $: filled = $puzzle[x][y] != 0;
  $: conflicted = $conflictCell[x][y];
  $: focused = $focusedCellId == cell_id;
  $: focusedNumber = !focused
    && $focusedCellId != -1
    && $puzzle[x][y] != 0
    && $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] == $puzzle[x][y];

  function handleClick() {
    $focusedCellId = $focusedCellId == cell_id ? -1 : cell_id;
  }

  function handleKeydown(event) {
    const k = event.key;
    if (!prefilled && $focusedCellId == cell_id && k >= '0' && k <= '9') {
      $puzzle[x][y] = k;
      $cellUpdate = true;
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

<div class:filled class:prefilled class:focusedNumber class:focused class={style} on:click={handleClick}>
  {#if $puzzle[x][y] != 0}
    {$puzzle[x][y]}
    <div class:conflicted></div>
  {:else}
    <Candidate cell_id={cell_id} />
  {/if}
</div>

<style>
  .cell {
    width: 51px;
    height: 51px;
    font-size: 30px;
    position: relative;

    border-top: 1px solid black;
    border-left: 1px solid black;
    font-weight: bold;
  }

  .filled {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .top-wall { border-top: 3px solid black; }
  .bottom-wall { border-bottom: 3px solid black; }
  .left-wall { border-left: 3px solid black; }
  .right-wall { border-right: 3px solid black; }

  .prefilled {
    background: #e6e6e6;
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
