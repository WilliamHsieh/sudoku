<script>
  import Api from "./Api.svelte";
  import Cell from "./Cell.svelte";
  import Timer from "./Timer.svelte";
  import Calendar from "./Calendar.svelte";
  import { done } from "./store";
  import { game } from "./game/game.svelte.js";
  import { onMount } from "svelte";

  let showCalendar = $state(true);

  function handleKeydown(e) {
    const cmd = e.ctrlKey || e.metaKey;
    // Only these chords are undo/redo. Ctrl/Alt/Meta+digit follows master and
    // still enters the digit.
    if (e.ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      game.redo();
      return;
    }
    if (cmd && e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      game.redo();
      return;
    }
    if (cmd && e.key.toLowerCase() === "z") {
      e.preventDefault();
      game.undo();
      return;
    }

    if (game.selected == -1) return;
    const id = game.selected;

    if (e.key >= "0" && e.key <= "9" && game.editable(id)) {
      const d = parseInt(e.key, 10);
      if (d === 0) game.clearAnswer(id);
      else game.fill(id, d);
    } else if (e.key == "ArrowLeft" && id % 9) {
      game.select(id - 1);
    } else if (e.key == "ArrowRight" && (id + 1) % 9) {
      game.select(id + 1);
    } else if (e.key == "ArrowUp" && id >= 9) {
      game.select(id - 9);
    } else if (e.key == "ArrowDown" && id + 9 < 81) {
      game.select(id + 9);
    } else {
      return;
    }
    e.preventDefault();
  }

  function handleGlobalKeydown(e) {
    if (e.key === "Escape" && $done) {
      game.dismiss();
    } else {
      handleKeydown(e);
    }
  }

  function removeFocus() {
    game.select(-1);
  }

  function handleSuccessBackdrop(event) {
    if (event.target === event.currentTarget) {
      game.dismiss();
    }
  }

  function toggleView() {
    showCalendar = !showCalendar;
  }

  function handleLoadPuzzle(event) {
    console.log("Puzzle loaded from calendar:", event.detail);
    showCalendar = false;
  }

  onMount(() => {
    window.addEventListener("loadPuzzle", handleLoadPuzzle);
    return () => {
      window.removeEventListener("loadPuzzle", handleLoadPuzzle);
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main>
  <div class="header">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <h1 onclick={removeFocus}>Sudoku</h1>
    {#if !showCalendar}
      <Timer />
    {/if}
    <button class="view-toggle" onclick={toggleView}>
      {showCalendar ? "🎯 Play" : "📅 Calendar"}
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
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="success-message" onclick={handleSuccessBackdrop}>
        <div class="success-card">
          <button class="success-close" onclick={() => game.dismiss()}
            >&times;</button
          >
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
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
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
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    background: white;
    padding: 0;

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
    position: relative;
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

  .success-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
    line-height: 1;
  }

  .success-close:hover {
    background: #f3f4f6;
    color: #374151;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
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
    0%,
    20%,
    50%,
    80%,
    100% {
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
