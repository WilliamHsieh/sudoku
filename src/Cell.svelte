<script>
  import PenBox from "./PenBox.svelte";
  import PencilBox from "./PencilBox.svelte";
  import { onMount } from "svelte";
  import {
    puzzle,
    userRemovePencil,
    focusedCellId,
    prefilled,
    cellUpdate,
    pencilBox,
  } from "./store";

  export let cell_id;
  const x = Math.floor(cell_id / 9);
  const y = cell_id % 9;
  let style = "cell";
  let isShiftPressed = false;
  let cellElement;
  let closestPencilIdx = -1;

  $: cellStyle = () => {
    let fg = "#374151";
    let bg = "white";

    if ($prefilled[x][y]) bg = "#e2e8f0";
    if ($puzzle[x][y] == 0) {
      fg = "#6b7280";
    } else if (
      $focusedCellId != -1 &&
      $puzzle[Math.floor($focusedCellId / 9)][$focusedCellId % 9] ==
        $puzzle[x][y]
    ) {
      bg = "#fde68a";
      fg = "#374151";
    }
    if ($focusedCellId == cell_id) {
      bg = "#3b82f6";
      fg = "white";
    }

    return `background-color: ${bg}; color: ${fg}`;
  };

  function handleKeyDown(e) {
    if (e.key === "Shift") {
      isShiftPressed = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === "Shift") {
      isShiftPressed = false;
      closestPencilIdx = -1;
    }
  }

  function handleMouseMove(e) {
    if (!isShiftPressed || !cellElement || $puzzle[x][y] !== 0) return;

    const rect = cellElement.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    // Calculate which pencil mark position is closest (3x3 grid)
    const pencilWidth = rect.width / 3;
    const pencilHeight = rect.height / 3;

    const gridX = Math.floor(relativeX / pencilWidth);
    const gridY = Math.floor(relativeY / pencilHeight);

    const newClosestIdx = Math.min(Math.max(gridY * 3 + gridX, 0), 8);

    // Only update if the pencil mark is visible
    if (
      $pencilBox[x][y][newClosestIdx] &&
      !$userRemovePencil[x][y][newClosestIdx]
    ) {
      closestPencilIdx = newClosestIdx;
    } else {
      closestPencilIdx = -1;
    }
  }

  function handleMouseLeave() {
    closestPencilIdx = -1;
  }

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
  bind:this={cellElement}
  class={style}
  style={cellStyle()}
  on:click={handleClick}
  on:contextmenu|preventDefault={handleRightClick}
  on:mousemove={handleMouseMove}
  on:mouseleave={handleMouseLeave}
>
  {#if $puzzle[x][y]}
    <PenBox {cell_id} />
  {:else}
    <div class="candidate">
      {#each Array(9) as _, idx}
        <PencilBox
          {cell_id}
          {idx}
          {isShiftPressed}
          isClosest={closestPencilIdx === idx}
        />
      {/each}
    </div>
  {/if}
</div>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

<style>
  .cell {
    aspect-ratio: 1;
    border: 0.25px solid #6b7280;
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
    border-top: 5px solid #374151; 
  }
  .bottom-wall { 
    border-bottom: 5px solid #374151; 
  }
  .left-wall { 
    border-left: 5px solid #374151; 
  }
  .right-wall { 
    border-right: 5px solid #374151; 
  }
</style>
