<script>
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { getShiftHover } from "./shift-hover.svelte.js";
  import { playUi } from "./play/session.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {number} cell_id
   * @property {number} idx
   */
  /** @type {Props} */
  let { cell_id, idx } = $props();

  const visible = $derived(game.hasNote(cell_id, idx + 1));
  const isSelected = $derived(game.selected === cell_id);
  const isShiftSlot = $derived.by(() => {
    const target = getShiftHover();
    return !!target && target.cell === cell_id && target.slot === idx;
  });
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
  const cued = $derived(isOnlyCandidate && playUi.showsCue(cell_id));

  function handleClick(e) {
    if (e.shiftKey) {
      e.stopPropagation();
      const target = getShiftHover();
      if (target && target.cell === cell_id && target.slot === idx) {
        game.enter(cell_id, target.d);
      }
      game.select(cell_id);
      return;
    }
    if (game.selected == cell_id) {
      game.toggleNote(cell_id, idx + 1);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="note-slot">
  <div
    class="pencil-box"
    class:invisible={!visible && !previewAdd}
    class:selected={isSelected}
    class:aim={isShiftSlot}
    class:matching-number={isMatchingNumber}
    class:cue={cued}
    class:preview-add={previewAdd}
    class:preview-remove={previewRemove}
    class:hidden-pending={hiddenPending}
    data-d={idx + 1}
    data-shift-slot={isShiftSlot ? "true" : undefined}
    onclick={handleClick}
  >
    {idx + 1}
  </div>
</div>

<style>
  /* Stretched 3×3 cell. Size chips against this box (cqw/cqh), not a
     cyclic 100% on the grid item. */
  .note-slot {
    container-type: size;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: stretch;
  }

  .pencil-box {
    font-size: calc(var(--cell) * var(--cand-size));
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
    min-height: 0;
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

  /* Opus shift-aim: empty slots and other candidates stay as they are. */
  :global(.board.shift-aim) .pencil-box:hover:not(.aim) {
    background: transparent;
    color: var(--cand);
  }
  :global(.board.shift-aim) .pencil-box.selected:hover:not(.aim) {
    background: transparent;
    color: var(--cand-on-selected);
  }
  :global(.board.shift-aim) .pencil-box.matching-number:hover:not(.aim) {
    background: var(--chip-bg);
    color: var(--chip-ink);
  }
  :global(.board.shift-aim) .pencil-box {
    cursor: crosshair;
  }

  /* Opus `.n.on.aim` / `.n.on.match` — 0.32 of --cell, contained so the
     1.5px ring (and 0.5px chip line) stay ≥1px from every grid line. */
  .pencil-box.aim,
  .pencil-box.aim:hover,
  .pencil-box.aim.selected:hover {
    position: relative;
    z-index: 2;
    place-self: center;
    box-sizing: border-box;
    width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 4px));
    height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 4px));
    max-width: calc(100cqw - 4px);
    max-height: calc(100cqh - 4px);
    border-radius: 3.5px;
    color: var(--ink);
    font-weight: var(--cand-weight);
    box-shadow: 0 0 0 1.5px var(--ink);
    background: transparent;
    animation: none;
    cursor: crosshair;
  }
  .pencil-box.aim.matching-number,
  .pencil-box.aim.matching-number:hover,
  .pencil-box.aim.matching-number.selected:hover {
    background: var(--chip-bg);
    color: var(--chip-ink);
    font-weight: var(--chip-weight);
    box-shadow: 0 0 0 1.5px var(--ink);
  }

  .pencil-box.matching-number {
    place-self: center;
    box-sizing: border-box;
    width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 4px));
    height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 4px));
    max-width: calc(100cqw - 4px);
    max-height: calc(100cqh - 4px);
    color: var(--chip-ink);
    font-weight: var(--chip-weight);
    background: var(--chip-bg);
    box-shadow: 0 0 0 0.5px var(--chip-line);
    border-radius: 3.5px;
  }

  .pencil-box.matching-number.selected {
    color: var(--chip-ink);
  }

  /* Single-candidate cue: 0.34-equivalent chip, same box as the match chip, 4px radius. */
  .pencil-box.cue {
    place-self: center;
    box-sizing: border-box;
    width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 4px));
    height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 4px));
    max-width: calc(100cqw - 4px);
    max-height: calc(100cqh - 4px);
    border-radius: 4px;
    z-index: 2;
    animation: lone-pulse 1.5s both;
  }

  @keyframes lone-pulse {
    0% {
      background: transparent;
      color: var(--cand);
      box-shadow: 0 0 0 0 transparent;
      animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    }
    18% {
      background: var(--cue-fill);
      color: var(--cue-ink);
      font-weight: 600;
      box-shadow:
        0 0 0 1px var(--cue-line),
        0 0 0 3px var(--cue-halo);
      animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
    }
    70% {
      background: var(--cue-fill);
      color: var(--cue-ink);
      font-weight: 600;
      box-shadow:
        0 0 0 1px var(--cue-line),
        0 0 0 0 transparent;
      animation-timing-function: ease-out;
    }
    100% {
      background: transparent;
      color: var(--cand);
      box-shadow: 0 0 0 0 transparent;
    }
  }

  @media (max-width: 599px) {
    .pencil-box.cue {
      width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 1px));
      height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 1px));
      max-width: calc(100cqw - 1px);
      max-height: calc(100cqh - 1px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pencil-box.cue {
      animation: none;
      background: var(--cue-fill);
      color: var(--cue-ink);
      font-weight: 600;
      box-shadow: 0 0 0 1px var(--cue-line);
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
      pointer-events: none;
    }

    /* No Shift aim on the pad. Size chips to 0.32 of --cell, leaving 1px
       in the slot so the 0.5px chip line stays ≥1px from every grid line.
       Include .aim so a match chip does not change size if Shift is held. */
    .pencil-box.matching-number {
      width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 1px));
      height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 1px));
      max-width: calc(100cqw - 1px);
      max-height: calc(100cqh - 1px);
    }
  }
</style>
