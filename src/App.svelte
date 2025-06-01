<script>
  import Api from './Api.svelte';
  import Cell from './Cell.svelte';
  import Timer from './Timer.svelte';
  import Calendar from './Calendar.svelte';
  import { puzzle, focusedCellId, cellUpdate, prefilled, done } from './store'

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
    {#if !showCalendar}
      <Timer />
    {/if}
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
    
    {#if $done}
      <div class="success-message">
        <div class="success-card">
          <div class="success-icon">🎉</div>
          <h2>Puzzle Complete!</h2>
          <p>Congratulations! You've successfully solved the Sudoku puzzle.</p>
        </div>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100%;
    height: 100vh;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    overflow-x: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    padding: 20px 0;
    border-bottom: 2px solid #e2e8f0;
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
  }

  .header h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .header h1:hover {
    transform: scale(1.02);
  }

  .view-toggle {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .view-toggle:hover {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    transform: translateY(-1px);
    box-shadow: 0 6px 12px -2px rgba(59, 130, 246, 0.4);
  }

  .view-toggle:active {
    transform: translateY(0);
  }

  .board {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 0;
    max-width: 650px;
    margin: 0 auto 32px auto;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    background: white;
    padding: 8px;

    -webkit-user-select: none;
    -moz-user-select: none;
    -o-user-select: none;
    user-select: none;
  }

  .success-message {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.3s ease;
  }

  .success-card {
    background: white;
    padding: 48px 32px;
    border-radius: 20px;
    text-align: center;
    max-width: 400px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: scaleIn 0.4s ease;
  }

  .success-icon {
    font-size: 4rem;
    margin-bottom: 16px;
    animation: bounce 1s infinite;
  }

  .success-card h2 {
    margin: 0 0 16px 0;
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-gray-900);
  }

  .success-card p {
    margin: 0;
    color: var(--color-gray-600);
    font-size: 1.1rem;
    line-height: 1.6;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { 
      opacity: 0;
      transform: scale(0.9);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-10px);
    }
    60% {
      transform: translateY(-5px);
    }
  }

  @media (max-width: 768px) {
    main {
      padding: 16px;
    }
    
    .header {
      margin-bottom: 24px;
      padding: 16px 0;
    }
    
    .header h1 {
      font-size: 2rem;
    }
    
    .board {
      max-width: 100%;
      margin-bottom: 24px;
    }

    .success-card {
      margin: 16px;
      padding: 32px 24px;
    }
    
    .success-card h2 {
      font-size: 1.75rem;
    }
    
    .success-icon {
      font-size: 3rem;
    }
  }
</style>
