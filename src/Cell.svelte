<script>
  import { onDestroy, untrack } from "svelte";
  import { autofill, autofillDelay } from "./autofill.svelte.js";
  import PenBox from "./PenBox.svelte";
  import PencilBox from "./PencilBox.svelte";
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { nextDoubleTap } from "./game/pad.js";
  import { maskDigits } from "./game/board.js";
  import { getShiftHover } from "./shift-hover.svelte.js";
  import { eraseCell, focusedDigit, lockTap, revealCellDigit } from "./keypad-actions.js";

  /** Touch pointerdowns also synthesize a click; ignore that click.
   * -Infinity so a mouse click in the first 700ms of the page is not swallowed. */
  let touchAt = -Infinity;

  /** @type {{ cell_id: number, desktop?: boolean, hint?: ReturnType<ReturnType<typeof import('./hints/session.svelte.js').createHintSession>['evidence']>, suppressHighlights?: boolean, hintFocus?: number, reducedMotion?: boolean }} */
  let {
    cell_id,
    desktop = false,
    hint = null,
    suppressHighlights = false,
    hintFocus = 0,
    reducedMotion = false,
  } = $props();
  const NOTE_SLOTS = Array.from({ length: 9 }, (_, i) => i);
  const row = $derived(Math.floor(cell_id / 9));
  const col = $derived(cell_id % 9);

  const value = $derived(game.value(cell_id));
  const given = $derived(game.given(cell_id));
  const selected = $derived(!suppressHighlights && game.selected === cell_id);
  const highlight = $derived(focusedDigit());
  const same = $derived(!suppressHighlights && value !== 0 && highlight === value);
  const tint = $derived(!suppressHighlights && padUi.marks?.tint.has(cell_id));
  const brush = $derived(padUi.marks?.brush);
  const conflict = $derived(!suppressHighlights && game.inConflict(cell_id));
  const notes = $derived(maskDigits(game.notes(cell_id)).join(""));
  const blocking = $derived(!suppressHighlights && padUi.blocking.includes(cell_id));
  const blocked = $derived(!suppressHighlights && padUi.blocked.includes(cell_id));
  const undoTarget = $derived(!suppressHighlights && padUi.undoTargets.includes(cell_id));

  /** @type {HTMLDivElement} */
  let element;
  // A remounted board starts at the current event, so saved answers stay still.
  let handledPlacement = untrack(() => game.placement);
  /** @type {Animation | undefined} */
  let placementAnimation;
  onDestroy(() => placementAnimation?.cancel());
  $effect(() => {
    const placement = game.placement;
    const changed = placement !== handledPlacement;
    handledPlacement = placement;
    if (suppressHighlights) {
      placementAnimation?.cancel();
      return;
    }
    if (!changed || !placement?.includes(cell_id) || reducedMotion) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const digit = element.querySelector(".pen-box");
    placementAnimation?.cancel();
    placementAnimation = digit?.animate([{ transform: "scale(0.86)" }, { transform: "scale(1)" }], {
      duration: 160,
      easing: "cubic-bezier(.22,.8,.24,1)",
    });
  });

  function handleRightClick() {
    if (game.solved) return;
    // Right-click and Erase operate on the same selected editable cell.
    if (game.selected == cell_id && !game.given(cell_id)) {
      if (desktop) eraseCell(cell_id);
      else game.clear(cell_id);
    }
  }

  /** Suppress touch-generated clicks before they can edit a pencil slot. */
  function handleClickCapture(e) {
    if (performance.now() - touchAt < 700) e.stopPropagation();
  }

  function handleClick(e) {
    if (game.solved) return;
    if (performance.now() - touchAt < 700) return;
    if (padUi.locked) {
      lockTap(cell_id);
      return;
    }
    const target = getShiftHover();
    if (e.shiftKey && target && target.cell === cell_id) {
      game.enter(cell_id, target.d);
    }
    game.select(cell_id);
    revealCellDigit(cell_id);
  }

  /** Touch: select on pointerdown (no 300ms delay) and detect double-tap fill. */
  function handlePointerDown(e) {
    if (game.solved) return;
    if (e.pointerType === "mouse" || (e.button !== undefined && e.button > 0)) return;
    touchAt = performance.now();
    e.preventDefault();
    const highlighted = focusedDigit();
    const step = nextDoubleTap(padUi.lastTap, cell_id, performance.now(), highlighted);
    padUi.lastTap = step.next;
    game.select(cell_id);
    if (step.isDouble) game.fillLone(cell_id, step.highlighted);
    revealCellDigit(cell_id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  bind:this={element}
  class="cell"
  class:given
  class:hint-focus={hintFocus > 0}
  class:hint-focus-alternate={hintFocus > 0 && hintFocus % 2 === 0}
  class:hint-focus-reduced={reducedMotion}
  class:af-filled={!suppressHighlights && autofill.placed.some(({ i }) => i === cell_id)}
  class:af-skipped={!suppressHighlights && autofill.skipped.includes(cell_id)}
  class:af-undone={!suppressHighlights && autofill.undone.includes(cell_id)}
  class:af-reduced={autofill.reduced}
  style:--af-delay={`${autofillDelay(
    autofill.placed.findIndex(({ i }) => i === cell_id),
    autofill.placed.length,
    autofill.reduced
  )}ms`}
  class:selected
  class:same
  class:conflict
  class:user={value !== 0 && !given}
  class:blocking
  class:blocked
  class:undo-target={undoTarget}
  class:hint-observe={hint?.observe}
  class:hint-premise={hint?.premise}
  class:hint-target={hint?.target}
  class:paint-add={tint && brush === "add"}
  class:paint-remove={tint && brush === "remove"}
  class:paint-committed={tint && padUi.marks?.phase !== "live"}
  class:paint-alternate={tint && padUi.commitId % 2 === 0}
  class:finger-add={!suppressHighlights && padUi.finger === cell_id && brush === "add"}
  class:finger-remove={!suppressHighlights && padUi.finger === cell_id && brush === "remove"}
  data-r={row}
  data-c={col}
  data-i={cell_id}
  data-value={value || ""}
  data-notes={notes}
  onpointerdown={handlePointerDown}
  onclickcapture={handleClickCapture}
  onclick={handleClick}
  oncontextmenu={(e) => {
    e.preventDefault();
    handleRightClick();
  }}
>
  {#if value}
    <PenBox {cell_id} {suppressHighlights} />
  {:else}
    <div class="candidate">
      {#each NOTE_SLOTS as idx (idx)}
        <PencilBox
          {cell_id}
          {idx}
          {suppressHighlights}
          hintMask={hint?.mask}
          hintPremise={hint?.candidates.includes(idx + 1)}
          hintExcluded={hint?.excluded.includes(idx + 1)}
          hintElimination={hint?.eliminations.includes(idx + 1)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .cell {
    --cell: calc(100cqi / 9);
    position: relative;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-right: var(--line-thin-w) solid var(--line-thin);
    border-bottom: var(--line-thin-w) solid var(--line-thin);
    font-family: var(--digit-font);
    cursor: pointer;
    background: var(--board-bg);
    color: var(--answer-ink);
    touch-action: manipulation;
    -webkit-touch-callout: none;
    user-select: none;
  }

  .cell[data-c="2"],
  .cell[data-c="5"] {
    border-right: var(--line-box-w) solid var(--line-box);
  }
  .cell[data-c="8"] {
    border-right: none;
  }
  .cell[data-r="2"],
  .cell[data-r="5"] {
    border-bottom: var(--line-box-w) solid var(--line-box);
  }
  .cell[data-r="8"] {
    border-bottom: none;
  }

  .cell.given {
    background: var(--given-bg);
  }
  .cell.same {
    background: var(--same-digit);
  }
  .cell.same.given {
    background: var(--same-digit-given);
  }
  .cell.same:not(.given):not(.conflict) :global(.pen-box) {
    color: var(--same-digit-ink);
  }
  .cell.selected {
    background: var(--sel-bg);
    box-shadow: inset 0 0 0 var(--sel-ring-w) var(--sel-ring);
    z-index: 1;
  }
  .cell.given.selected {
    background: var(--sel-bg);
  }
  .cell.conflict,
  .cell.same.conflict,
  .cell.same.given.conflict {
    background: var(--conflict-bg);
  }
  .cell.hint-observe {
    background: var(--sel-bg);
  }
  .cell.hint-premise {
    box-shadow: inset 0 0 0 2px var(--blue);
  }
  .cell.hint-premise :global(.pen-box) {
    color: var(--blue);
  }
  .cell.hint-target {
    box-shadow: inset 0 0 0 2px var(--cue-ink);
  }

  .cell.hint-focus::before {
    content: "";
    position: absolute;
    inset: 2px;
    z-index: 4;
    border: 3px solid var(--sel-ring);
    border-radius: 3px;
    pointer-events: none;
    animation: hint-focus 900ms ease-in-out both;
  }
  .cell.hint-focus.hint-focus-alternate::before {
    animation-name: hint-focus-alternate;
  }
  .cell.hint-focus.hint-focus-reduced::before {
    animation: none;
  }
  @keyframes hint-focus {
    0%,
    45%,
    100% {
      opacity: 1;
    }
    25%,
    70% {
      opacity: 0.25;
    }
  }
  @keyframes hint-focus-alternate {
    0%,
    45%,
    100% {
      opacity: 1;
    }
    25%,
    70% {
      opacity: 0.25;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell.hint-focus::before {
      animation: none;
    }
  }

  .candidate {
    position: absolute;
    inset: 1px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
  }

  .cell.blocking {
    background-color: color-mix(in srgb, var(--undo-ring) 24%, var(--board-bg));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--undo-ring) 70%, transparent);
  }

  .cell.blocked {
    animation: blocked var(--motion) var(--ease-out);
  }

  .cell.paint-add::after,
  .cell.paint-remove::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: color-mix(in srgb, var(--sel-ring) 12%, transparent);
    opacity: 1;
  }
  .cell.paint-remove::after {
    background: color-mix(in srgb, var(--conflict) 10%, transparent);
  }
  .cell.paint-committed::after {
    opacity: 0;
    /* Keyboard taps can begin and commit in one render. An animation has an
       explicit starting opacity even when no live tint was painted first. */
    animation: paint-tint 200ms ease-out both;
  }
  .cell.paint-committed.paint-alternate::after {
    /* Restart even when two synchronous taps on the same cell keep the
       committed class through Svelte's batched begin/finish updates. */
    animation-name: paint-tint-alternate;
  }
  @keyframes paint-tint {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes paint-tint-alternate {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  .cell.finger-add {
    box-shadow: inset 0 0 0 3px var(--sel-ring);
  }
  .cell.finger-remove {
    box-shadow: inset 0 0 0 3px var(--conflict);
  }
  .candidate {
    z-index: 1;
  }
  .cell.undo-target {
    z-index: 3;
  }

  .cell.undo-target::before {
    content: "";
    position: absolute;
    inset: 1px;
    border: 2.5px solid var(--undo-ring);
    border-radius: 4px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--undo-ring) 18%, transparent);
    pointer-events: none;
    animation: undo-target var(--ring-ms, 620ms) var(--ease-out) forwards;
  }

  @keyframes blocked {
    from {
      background-color: color-mix(in srgb, var(--undo-ring) 24%, var(--board-bg));
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--undo-ring) 70%, transparent);
    }
  }

  @keyframes undo-target {
    0% {
      opacity: 0;
      transform: scale(1.9);
    }
    38% {
      opacity: 1;
      transform: scale(1);
    }
    75% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  @media (max-width: 599px) {
    .cell {
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      touch-action: none;
      overscroll-behavior: none;
    }

    .candidate {
      pointer-events: none;
    }

    /* Combo C `.cell.conf::after` — 5×5 at a 3px inset. Don't clip the dot. */
    .cell.conflict {
      overflow: visible;
    }
    .cell.conflict::after {
      content: "";
      position: absolute;
      top: 3px;
      right: 3px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--conflict);
    }
  }

  :global(html.kp-freeze) .cell.blocked {
    animation: none;
    background-color: color-mix(in srgb, var(--undo-ring) 24%, var(--board-bg));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--undo-ring) 70%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .cell.blocked {
      animation: none;
      background-color: color-mix(in srgb, var(--undo-ring) 24%, var(--board-bg));
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--undo-ring) 70%, transparent);
    }
    .cell.paint-committed::after,
    .cell.paint-committed.paint-alternate::after {
      animation: none;
    }
    .cell.undo-target::before {
      animation: none;
    }
  }
</style>
