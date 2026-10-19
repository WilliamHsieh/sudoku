<script>
  import Api from "./Api.svelte";
  import Cell from "./Cell.svelte";
  import Timer from "./Timer.svelte";
  import Calendar from "./Calendar.svelte";
  import Tools from "./Tools.svelte";
  import Keypad from "./Keypad.svelte";
  import { done } from "./store";
  import { game } from "./game/game.svelte.js";
  import { ring } from "./ring.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { installIosZoomGuards } from "./ios-zoom.js";
  import { onMount } from "svelte";

  const CELL_IDS = Array.from({ length: 81 }, (_, i) => i);

  let showCalendar = $state(true);
  let wrapEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let ringEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));

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
    game.setBeforeMutate(() => ring.flush());
    window.addEventListener("loadPuzzle", handleLoadPuzzle);
    return () => {
      game.setBeforeMutate(() => {});
      ring.destroy();
      window.removeEventListener("loadPuzzle", handleLoadPuzzle);
    };
  });

  $effect(() => {
    if (showCalendar) return;
    if (wrapEl && ringEl) ring.bind(wrapEl, ringEl);
    const mobile = window.matchMedia("(max-width: 599px)").matches;
    const stopZoom = mobile ? installIosZoomGuards() : () => {};
    return () => {
      stopZoom();
      ring.destroy();
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
      {#if showCalendar}
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2"></rect>
          <path d="M3 9h18"></path>
          <path d="M3 15h18"></path>
          <path d="M9 3v18"></path>
          <path d="M15 3v18"></path>
        </svg>
        Play
      {:else}
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 2v4"></path>
          <path d="M16 2v4"></path>
          <rect width="18" height="18" x="3" y="4" rx="2"></rect>
          <path d="M3 10h18"></path>
        </svg>
        Calendar
      {/if}
    </button>
  </div>

  {#if showCalendar}
    <Calendar />
  {:else}
    <div class="play">
      <Api />
      <div class="board-wrap" bind:this={wrapEl}>
        <div class="board" class:quiet={padUi.quiet}>
          {#each CELL_IDS as id (id)}
            <Cell cell_id={id} />
          {/each}
        </div>
        <div class="undo-ring" bind:this={ringEl} aria-hidden="true"></div>
      </div>
      <div class="mobile-chrome">
        <Tools />
        <Keypad />
        <p class="pad-hint">Tap = answer · Swipe up = candidate</p>
      </div>
    </div>

    {#if $done}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="success-message" onclick={handleSuccessBackdrop}>
        <div class="success-card">
          <button class="success-close" onclick={() => game.dismiss()}>&times;</button>
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
    min-height: 100vh;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    font-family: var(--ui-font);
    color: var(--ui-ink);
    background: var(--page-bg);
    overflow-x: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 auto 24px;
    padding: 8px 0 16px;
    border-bottom: var(--line-thin-w) solid var(--line-thin);
    max-width: 1200px;
  }

  .header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--ui-ink);
    cursor: pointer;
  }

  .view-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--key-bg);
    color: var(--ui-ink);
    border: 1px solid var(--key-line);
    border-radius: var(--key-radius);
    padding: 8px 14px;
    font-size: 0.9rem;
    font-weight: 600;
    font-family: var(--ui-font);
    cursor: pointer;
    box-shadow: var(--key-shadow);
  }

  .btn-icon {
    width: 15px;
    height: 15px;
    flex: none;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .view-toggle:hover {
    background: var(--key-pressed);
  }

  .view-toggle:active {
    background: var(--given-bg);
  }

  .board-wrap {
    position: relative;
    max-width: 650px;
    width: 100%;
    margin: 0 auto 32px;
  }

  .board {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(9, minmax(0, 1fr));
    grid-template-rows: repeat(9, minmax(0, 1fr));
    width: 100%;
    aspect-ratio: 1;
    border: var(--line-outer-w) solid var(--line-outer);
    border-radius: var(--board-radius);
    overflow: hidden;
    background: var(--board-bg);
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }

  .undo-ring {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 4;
    box-sizing: border-box;
    border: 2.5px solid var(--undo-ring);
    border-radius: 4px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--undo-ring) 18%, transparent);
    pointer-events: none;
    opacity: 0;
  }

  .board.quiet :global(.cell.same:not(.conflict)) {
    background: var(--board-bg);
  }
  .board.quiet :global(.cell.same.given:not(.conflict)) {
    background: var(--given-bg);
  }
  .board.quiet :global(.pencil-box.matching-number:not(.only-candidate)) {
    color: var(--cand);
    background: transparent;
    box-shadow: none;
  }

  .mobile-chrome {
    display: none;
  }

  .pad-hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--ui-soft);
  }

  .success-message {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .success-card {
    background: var(--board-bg);
    color: var(--ui-ink);
    padding: 48px 32px;
    border-radius: 16px;
    text-align: center;
    max-width: 400px;
    box-shadow: var(--shadow-dialog);
    position: relative;
  }

  .success-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  .success-card h2 {
    margin: 0 0 16px;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--ui-ink);
  }

  .success-card p {
    margin: 0;
    color: var(--ui-soft);
    font-size: 1.05rem;
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
    color: var(--ui-soft);
    padding: 4px;
    border-radius: 4px;
    line-height: 1;
  }

  .success-close:hover {
    background: var(--given-bg);
    color: var(--ui-ink);
  }

  @media (max-width: 768px) {
    main {
      padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    }

    .header {
      margin-bottom: 16px;
      padding: 4px 0 12px;
    }

    .board-wrap {
      max-width: 100%;
      margin-bottom: 24px;
    }

    .success-card {
      margin: 16px;
      padding: 32px 24px;
    }
  }

  /* Prototype used 600px as the wide-board line; the pad lives below that so
     1280 desktop chrome (and every existing e2e test) stays unchanged. */
  @media (max-width: 599px) {
    .board-wrap {
      margin-bottom: 0;
    }

    .play {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-chrome {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
