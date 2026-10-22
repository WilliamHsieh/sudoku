<script>
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { getShiftHover } from "./shift-hover.svelte.js";
  import { playUi } from "./play/session.svelte.js";
  import { focusedDigit, revealCellDigit } from "./keypad-actions.js";

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
  const highlight = $derived(focusedDigit());
  const added = $derived(padUi.marks?.d === idx + 1 && padUi.marks.add.has(cell_id));
  const ghost = $derived(!visible && padUi.marks?.d === idx + 1 && padUi.marks.rem.has(cell_id));
  const fading = $derived(padUi.marks?.phase === "fade");
  const isMatchingNumber = $derived(highlight !== 0 && idx + 1 === highlight && visible && !ghost);
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
  const cued = $derived(!added && !ghost && isOnlyCandidate && playUi.showsCue(cell_id));
  const cueHold = $derived(cued && playUi.phase === "hold");

  function handleClick(e) {
    // The cell click is the lock toggle. A pencil click must not also edit.
    if (padUi.locked) return;
    if (e.shiftKey) {
      e.stopPropagation();
      const target = getShiftHover();
      if (target && target.cell === cell_id && target.slot === idx) {
        game.enter(cell_id, target.d);
      }
      game.select(cell_id);
      revealCellDigit(cell_id);
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
    class:invisible={!visible && !previewAdd && !ghost}
    class:paint-added={added}
    class:paint-blue={added && !fading}
    class:paint-fading={fading && (added || ghost)}
    class:ghost
    class:selected={isSelected}
    class:aim={isShiftSlot}
    class:matching-number={isMatchingNumber}
    class:cue={cued}
    class:cue-hold={cueHold}
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
  :global(.board.shift-aim) .pencil-box:is(.matching-number, .paint-added):hover:not(.aim) {
    background: var(--paint-chip-bg, var(--chip-bg));
    color: var(--paint-chip-ink, var(--chip-ink));
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
  .pencil-box.aim:is(.matching-number, .paint-added),
  .pencil-box.aim:is(.matching-number, .paint-added):hover,
  .pencil-box.aim:is(.matching-number, .paint-added).selected:hover {
    background: var(--paint-chip-bg, var(--chip-bg));
    color: var(--paint-chip-ink, var(--chip-ink));
    font-weight: var(--chip-weight);
    box-shadow: 0 0 0 1.5px var(--ink);
  }

  .pencil-box:is(.matching-number, .paint-added) {
    place-self: center;
    box-sizing: border-box;
    width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 4px));
    height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 4px));
    max-width: calc(100cqw - 4px);
    max-height: calc(100cqh - 4px);
    color: var(--paint-chip-ink, var(--chip-ink));
    font-weight: var(--chip-weight);
    background: var(--paint-chip-bg, var(--chip-bg));
    box-shadow: 0 0 0 0.5px var(--paint-chip-line, var(--chip-line));
    border-radius: 3.5px;
  }

  .pencil-box:is(.matching-number, .paint-added).selected {
    color: var(--paint-chip-ink, var(--chip-ink));
  }

  .pencil-box.ghost {
    color: var(--conflict);
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
    opacity: 0.8;
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

  /* Edge slots move inward so the 3px ring stays 1px off the grid line.
     Center slot (5) is already clear. Size stays the match-chip size. */
  .pencil-box.cue[data-d="2"] {
    transform: translateY(1px);
  }
  .pencil-box.cue[data-d="4"] {
    transform: translateX(1px);
  }
  .pencil-box.cue[data-d="6"] {
    transform: translateX(-1px);
  }
  .pencil-box.cue[data-d="8"] {
    transform: translateY(-1px);
  }
  .pencil-box.cue[data-d="1"] {
    transform: translate(1px, 1px);
  }
  .pencil-box.cue[data-d="3"] {
    transform: translate(-1px, 1px);
  }
  .pencil-box.cue[data-d="7"] {
    transform: translate(1px, -1px);
  }
  .pencil-box.cue[data-d="9"] {
    transform: translate(-1px, -1px);
  }

  @media (max-width: 599px) {
    .pencil-box.cue {
      width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 1px));
      height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 1px));
      max-width: calc(100cqw - 1px);
      max-height: calc(100cqh - 1px);
    }
    .pencil-box.cue[data-d="2"] {
      transform: translateY(2.5px);
    }
    .pencil-box.cue[data-d="4"] {
      transform: translateX(2.5px);
    }
    .pencil-box.cue[data-d="6"] {
      transform: translateX(-2.5px);
    }
    .pencil-box.cue[data-d="8"] {
      transform: translateY(-2.5px);
    }
    .pencil-box.cue[data-d="1"] {
      transform: translate(2.5px, 2.5px);
    }
    .pencil-box.cue[data-d="3"] {
      transform: translate(-2.5px, 2.5px);
    }
    .pencil-box.cue[data-d="7"] {
      transform: translate(2.5px, -2.5px);
    }
    .pencil-box.cue[data-d="9"] {
      transform: translate(-2.5px, -2.5px);
    }
  }

  /* Hold (reduced motion, including ?rm=1) stays on the tint. The flash animation
     would otherwise end on the transparent keyframe while the class remains. */
  .pencil-box.cue.cue-hold {
    animation: none;
    background: var(--cue-fill);
    color: var(--cue-ink);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--cue-line);
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
    .pencil-box:is(.matching-number, .paint-added) {
      width: min(calc(var(--cell) * var(--chip-size)), calc(100cqw - 1px));
      height: min(calc(var(--cell) * var(--chip-size)), calc(100cqh - 1px));
      max-width: calc(100cqw - 1px);
      max-height: calc(100cqh - 1px);
    }
  }
  .pencil-box.paint-blue {
    --paint-chip-bg: var(--add-chip-bg);
    --paint-chip-ink: var(--add-chip-ink);
    --paint-chip-line: var(--add-chip-line);
  }
  .pencil-box.paint-blue.selected:hover {
    background: var(--add-chip-bg);
    color: var(--add-chip-ink);
  }
  .pencil-box.paint-fading {
    transition:
      background-color 315ms ease-out,
      color 315ms ease-out,
      box-shadow 315ms ease-out;
  }
  .pencil-box.paint-added.paint-fading:not(.matching-number) {
    background: transparent;
    color: var(--cand);
    box-shadow: none;
  }
  .pencil-box.ghost.paint-fading {
    opacity: 0;
    transition: opacity 315ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .pencil-box.paint-fading {
      transition: none;
    }
    .pencil-box.paint-added.paint-fading,
    .pencil-box.paint-added.paint-fading:not(.matching-number) {
      --paint-chip-bg: var(--add-chip-bg);
      --paint-chip-ink: var(--add-chip-ink);
      --paint-chip-line: var(--add-chip-line);
      background: var(--add-chip-bg);
      color: var(--add-chip-ink);
      box-shadow: 0 0 0 0.5px var(--add-chip-line);
    }
    .pencil-box.ghost.paint-fading {
      opacity: 0.8;
    }
  }
</style>
