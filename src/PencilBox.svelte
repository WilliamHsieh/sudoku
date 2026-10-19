<script>
  import { game } from "./game/game.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {number} cell_id
   * @property {number} idx
   * @property {boolean} [isShiftPressed]
   * @property {boolean} [isClosest]
   */
  /** @type {Props} */
  let { cell_id, idx, isShiftPressed = false, isClosest = false } = $props();

  let localShiftPressed = $state(false);
  let showOnlyCandidateHint = $state(false);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let hintTimer = null;

  const visible = $derived(game.hasNote(cell_id, idx + 1));
  const isSelected = $derived(game.selected === cell_id);
  const showShiftCursor = $derived(isShiftPressed || localShiftPressed);
  const focusedValue = $derived(game.selected === -1 ? 0 : game.value(game.selected));
  const isMatchingNumber = $derived(focusedValue !== 0 && idx + 1 === focusedValue && visible);
  const isOnlyCandidate = $derived(
    game.value(cell_id) === 0 && visible && game.noteCount(cell_id) === 1
  );

  function handleClick(e) {
    if (e.shiftKey) {
      if (game.hasNote(cell_id, idx + 1)) game.enter(cell_id, idx + 1);
    } else if (game.selected == cell_id) {
      game.toggleNote(cell_id, idx + 1);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Shift") localShiftPressed = true;
  }

  function handleKeyUp(e) {
    if (e.key === "Shift") localShiftPressed = false;
  }

  function startRepeatingCycle() {
    hintTimer = setTimeout(() => {
      showOnlyCandidateHint = true;
      setTimeout(() => {
        showOnlyCandidateHint = false;
      }, 1500);
      startRepeatingCycle();
    }, 15000);
  }

  function clearTimers() {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    showOnlyCandidateHint = false;
  }

  $effect(() => {
    if (isOnlyCandidate) {
      clearTimers();
      startRepeatingCycle();
      return () => clearTimers();
    }
    clearTimers();
  });
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="pencil-box"
  class:invisible={!visible}
  class:selected={isSelected}
  class:shift-hover={showShiftCursor}
  class:snapped={isClosest && showShiftCursor}
  class:matching-number={isMatchingNumber}
  class:only-candidate={showOnlyCandidateHint}
  onclick={handleClick}
>
  {idx + 1}
</div>

<style>
  .pencil-box {
    font-size: 0.9rem;
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: 500;
    color: #9ca3af;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    transition: all 0.15s ease;
    cursor: pointer;
    border-radius: 2px;
    min-height: 20px;
  }

  .pencil-box.selected {
    color: white;
  }

  .pencil-box:hover {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }

  .pencil-box.selected:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .pencil-box.shift-hover {
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M8 2v12M2 8h12' stroke='%23374151' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")
        8 8,
      crosshair;
  }

  .pencil-box.shift-hover:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath d='M8 2v12M2 8h12' stroke='%23ef4444' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")
        8 8,
      crosshair;
  }

  .pencil-box.snapped {
    background: rgba(34, 197, 94, 0.2) !important;
    color: #22c55e !important;
    transform: scale(1.1);
    border: 1px solid #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
    z-index: 10;
    position: relative;
  }

  .pencil-box.matching-number {
    background: rgba(253, 230, 138, 0.3);
    color: #b45309;
    border: 1px solid rgba(253, 230, 138, 0.6);
    border-radius: 3px;
  }

  .pencil-box.matching-number.selected {
    background: rgba(253, 230, 138, 0.15);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(253, 230, 138, 0.4);
  }

  .pencil-box.only-candidate {
    background: rgba(34, 197, 94, 0.2);
    color: #15803d;
    border: 2px solid #22c55e;
    border-radius: 4px;
    font-weight: 600;
    animation: pulse-glow 2s ease-in-out infinite;
    position: relative;
    z-index: 5;
  }

  .pencil-box.only-candidate.selected {
    background: rgba(34, 197, 94, 0.15);
    color: rgba(255, 255, 255, 0.95);
    border: 2px solid rgba(34, 197, 94, 0.6);
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.3);
    }
    50% {
      box-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
    }
  }

  .invisible {
    color: transparent !important;
  }
</style>
