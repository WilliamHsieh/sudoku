<script>
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { shiftHover } from "./shift-hover.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {number} cell_id
   * @property {number} idx
   */
  /** @type {Props} */
  let { cell_id, idx } = $props();

  let showOnlyCandidateHint = $state(false);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let hintTimer = null;

  const visible = $derived(game.hasNote(cell_id, idx + 1));
  const isSelected = $derived(game.selected === cell_id);
  const isShiftSlot = $derived(
    !!shiftHover && shiftHover.cell === cell_id && shiftHover.slot === idx
  );
  const focusedValue = $derived(game.selected === -1 ? 0 : game.value(game.selected));
  const isMatchingNumber = $derived(focusedValue !== 0 && idx + 1 === focusedValue && visible);
  const isOnlyCandidate = $derived(
    game.value(cell_id) === 0 && visible && game.noteCount(cell_id) === 1
  );
  const previewAdd = $derived(
    padUi.preview?.cell === cell_id && padUi.preview?.d === idx + 1 && padUi.preview?.kind === "add"
  );
  const previewRemove = $derived(
    padUi.preview?.cell === cell_id &&
      padUi.preview?.d === idx + 1 &&
      padUi.preview?.kind === "remove"
  );
  const hiddenPending = $derived(padUi.pending?.cell === cell_id && padUi.pending?.d === idx + 1);

  function handleClick(e) {
    if (e.shiftKey) {
      e.stopPropagation();
      if (isShiftSlot) game.enter(cell_id, idx + 1);
      game.select(cell_id);
      return;
    }
    if (game.selected == cell_id) {
      game.toggleNote(cell_id, idx + 1);
    }
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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="pencil-box"
  class:invisible={!visible && !previewAdd}
  class:selected={isSelected}
  class:shift-slot={isShiftSlot}
  class:matching-number={isMatchingNumber}
  class:only-candidate={showOnlyCandidateHint}
  class:preview-add={previewAdd}
  class:preview-remove={previewRemove}
  class:hidden-pending={hiddenPending}
  data-d={idx + 1}
  data-shift-slot={isShiftSlot ? "true" : undefined}
  onclick={handleClick}
>
  {idx + 1}
</div>

<style>
  .pencil-box {
    font-size: calc(var(--cell) * var(--cand-size));
    display: flex;
    justify-content: center;
    align-items: center;
    font-weight: var(--cand-weight);
    color: var(--cand);
    font-family: var(--digit-font);
    cursor: pointer;
    border-radius: 3px;
    line-height: 1;
  }

  .pencil-box.selected {
    color: var(--cand-on-selected);
  }

  .pencil-box:hover {
    background: color-mix(in srgb, var(--sel-ring) 12%, transparent);
    color: var(--sel-ring);
  }

  .pencil-box.selected:hover {
    background: color-mix(in srgb, var(--sel-ring) 16%, transparent);
    color: var(--sel-ink);
  }

  /* One derived Shift-hover: same box as a normal slot hover, not the
     conflict-red outline. Digit may stay conflict-tinted (master). */
  .pencil-box.shift-slot,
  .pencil-box.shift-slot:hover,
  .pencil-box.shift-slot.selected,
  .pencil-box.shift-slot.selected:hover,
  .pencil-box.shift-slot.matching-number,
  .pencil-box.shift-slot.only-candidate {
    cursor: crosshair;
    background: color-mix(in srgb, var(--sel-ring) 12%, transparent);
    color: var(--conflict);
    box-shadow: 0 0 0 1px var(--sel-ring);
    border-radius: 4px;
    font-weight: 700;
    z-index: 10;
    position: relative;
    animation: none;
  }

  .pencil-box.matching-number {
    color: var(--chip-ink);
    font-weight: var(--chip-weight);
    background: var(--chip-bg);
    box-shadow: 0 0 0 0.5px var(--chip-line);
    border-radius: 3.5px;
  }

  .pencil-box.matching-number.selected {
    color: var(--chip-ink);
  }

  .pencil-box.only-candidate {
    background: var(--cue-fill);
    color: var(--cue-ink);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--cue-line);
    border-radius: 4px;
    animation: pulse-glow 2s ease-in-out infinite;
    position: relative;
    z-index: 5;
  }

  .pencil-box.only-candidate.selected {
    background: var(--cue-fill);
    color: var(--cue-ink);
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 0 1px var(--cue-line);
    }
    50% {
      box-shadow:
        0 0 0 1px var(--cue-line),
        0 0 10px color-mix(in srgb, var(--cue-line) 50%, transparent);
    }
  }

  .invisible {
    color: transparent !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .pencil-box.preview-add {
    opacity: 0.45;
    color: var(--sel-ring);
  }

  .pencil-box.preview-remove {
    opacity: 0.55;
    color: var(--conflict);
    text-decoration: line-through;
  }

  .pencil-box.hidden-pending {
    opacity: 0 !important;
  }

  @media (max-width: 599px) {
    .pencil-box {
      min-width: 0;
      min-height: 0;
      pointer-events: none;
    }

    .pencil-box.matching-number {
      place-self: center;
      box-sizing: border-box;
      width: calc(var(--cell) * var(--chip-size));
      height: calc(var(--cell) * var(--chip-size));
    }
  }
</style>
