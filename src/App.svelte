<script>
  import Api from './Api.svelte';
  import Cell from './Cell.svelte';
  import Timer from './Timer.svelte';
  import Calendar from './Calendar.svelte';
  import { puzzle, focusedCellId, cellUpdate, prefilled } from './store'

  let showCalendar = false;

  function handleKeydown(e) {
    if ($focusedCellId == -1) return;
    const x = Math.floor($focusedCellId / 9);
    const y = $focusedCellId % 9;

    if (e.key >= '0' && e.key <= '9' && !$prefilled[x][y]) {
      $puzzle[x][y] = parseInt(e.key, 10);
      $cellUpdate = true;
    } else if (e.key == 'ArrowLeft' && $focusedCellId % 9) {
      $focusedCellId -= 1;
    } else if (e.key == 'ArrowRight' && ($focusedCellId + 1) % 9) {
      $focusedCellId += 1;
    } else if (e.key == 'ArrowUp' && $focusedCellId >= 9) {
      $focusedCellId -= 9;
    } else if (e.key == 'ArrowDown' && $focusedCellId + 9 < 81) {
      $focusedCellId += 9;
    }
  }

  function removeFocus() {
    $focusedCellId = -1;
  }

  function toggleView() {
    showCalendar = !showCalendar;
  }

  // Listen for puzzle loading events from calendar
  function handleLoadPuzzle(event) {
    console.log('Puzzle loaded from calendar:', event.detail);
    showCalendar = false; // Switch back to puzzle view
  }

  // Add event listener when component mounts
  import { onMount } from 'svelte';
  onMount(() => {
    window.addEventListener('loadPuzzle', handleLoadPuzzle);
    return () => {
      window.removeEventListener('loadPuzzle', handleLoadPuzzle);
    };
  });
</script>

<svelte:window on:keydown|preventDefault={handleKeydown}/>

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main>
  <div class="header">
    <h1 on:click={removeFocus}>Sudoku</h1>
    <button class="view-toggle" on:click={toggleView}>
      {showCalendar ? '🎯 Play' : '📅 Calendar'}
    </button>
  </div>

  {#if showCalendar}
    <Calendar />
  {:else}
    <Api />
    <div class="board">
      {#each Array(81) as _, id}
        <Cell cell_id={id} />
      {/each}
    </div>
    <Timer />
  {/if}
</main>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header h1 {
    margin: 0;
  }

  .view-toggle {
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .view-toggle:hover {
    background: #2563eb;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(9, auto);
    grid-auto-rows: auto;

    -webkit-user-select:none;
    -moz-user-select:none;
    -o-user-select:none;
    user-select:none;
  }
</style>
