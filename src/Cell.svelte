<script>
  import PenBox from './PenBox.svelte';
  import PencilBox from './PencilBox.svelte';
  import { onMount } from 'svelte';
  import { puzzle, userRemovePencil, focusedCellId, prefilled, cellUpdate } from './store'

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
  let style = "cell";

  $: cellStyle = () => {
    let fg = "#374151";
    let bg = "white";

    if ($prefilled[x][y]) bg = "#e2e8f0";
    if ($puzzle[x][y] == 0) {
      fg = "#6b7280";
    } else if ($focusedCellId != -1 && $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] == $puzzle[x][y]) {
      bg = "#fde047";
      fg = "#374151";
    }
    if ($focusedCellId == cell_id) {
      bg = "#3b82f6";
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

<div
  class={style}
  style={cellStyle()}
  on:click={handleClick}
  on:contextmenu|preventDefault={handleRightClick}
>
  {#if $puzzle[x][y]}
    <PenBox cell_id={cell_id} />
  {:else}
    <div class="candidate">
      {#each Array(9) as _, idx}
        <PencilBox cell_id={cell_id} idx={idx} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .cell {
    aspect-ratio: 1;
    border: 1px solid #374151;
    transition: all 0.15s ease;
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    min-height: 60px;
    padding: 2px;
  }

  .candidate {
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 1px;
  }

  .top-wall { 
    border-top: 3px solid #374151; 
  }
  .bottom-wall { 
    border-bottom: 3px solid #374151; 
  }
  .left-wall { 
    border-left: 3px solid #374151; 
  }
  .right-wall { 
    border-right: 3px solid #374151; 
  }
</style>
