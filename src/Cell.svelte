<script>
  import PenBox from "./PenBox.svelte";
  import PencilBox from "./PencilBox.svelte";
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { nextDoubleTap } from "./game/pad.js";
  import { maskDigits } from "./game/board.js";
  import { getShiftHover } from "./shift-hover.svelte.js";
  import { lockTap, secondFingerToggle } from "./keypad-actions.js";

  /** Touch pointerdowns also synthesize a click; ignore that click. */
  let touchAt = 0;

  /** @type {{ cell_id: number }} */
  let { cell_id } = $props();
  const NOTE_SLOTS = Array.from({ length: 9 }, (_, i) => i);
  const row = $derived(Math.floor(cell_id / 9));
  const col = $derived(cell_id % 9);

  const value = $derived(game.value(cell_id));
  const given = $derived(game.given(cell_id));
  const selected = $derived(game.selected === cell_id);
  const highlight = $derived(
    padUi.locked || padUi.shown || (game.selected >= 0 ? game.value(game.selected) : 0)
  );
  const same = $derived(value !== 0 && highlight === value);
  const tick = $derived(padUi.ticks[cell_id]);
  const holdMark = $derived(padUi.holds[cell_id]);
  const conflict = $derived(game.inConflict(cell_id));
  const notes = $derived(maskDigits(game.notes(cell_id)).join(""));
  const blocking = $derived(padUi.blocking.includes(cell_id));
  const blocked = $derived(padUi.blocked.includes(cell_id));
  const undoTarget = $derived(padUi.undoTargets.includes(cell_id));

  function handleRightClick() {
    // Same as master: only the selected non-given cell.
    if (game.selected == cell_id && !game.given(cell_id)) {
      game.clear(cell_id);
    }
  }

  function revealFilled() {
    if (padUi.locked) return;
    const v = game.value(cell_id);
    if (v) padUi.shown = v;
  }

  function handleClick(e) {
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
    revealFilled();
  }

  /** Touch: select on pointerdown (no 300ms delay) and detect double-tap fill. */
  function handlePointerDown(e) {
    if (e.pointerType === "mouse" || (e.button !== undefined && e.button > 0)) return;
    touchAt = performance.now();
    e.preventDefault();
    if (padUi.hold && e.pointerId !== padUi.hold.pid) {
      secondFingerToggle(cell_id);
      return;
    }
    if (padUi.locked) {
      lockTap(cell_id);
      return;
    }
    const highlighted = padUi.shown || (game.selected >= 0 ? game.value(game.selected) : 0);
    const step = nextDoubleTap(padUi.lastTap, cell_id, performance.now(), highlighted);
    padUi.lastTap = step.next;
    game.select(cell_id);
    revealFilled();
    if (step.isDouble) game.fillLone(cell_id, step.highlighted);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="cell"
  class:given
  class:selected
  class:same
  class:conflict
  class:user={value !== 0 && !given}
  class:blocking
  class:blocked
  class:undo-target={undoTarget}
  class:tick-add={tick === "add"}
  class:tick-rem={tick === "remove"}
  class:t-add={holdMark === "add"}
  class:t-rem={holdMark === "remove"}
  data-r={row}
  data-c={col}
  data-i={cell_id}
  data-value={value || ""}
  data-notes={notes}
  onpointerdown={handlePointerDown}
  onclick={handleClick}
  oncontextmenu={(e) => {
    e.preventDefault();
    handleRightClick();
  }}
>
  {#if value}
    <PenBox {cell_id} />
  {:else}
    <div class="candidate">
      {#each NOTE_SLOTS as idx (idx)}
        <PencilBox {cell_id} {idx} />
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
  .cell.selected {
    background: var(--sel-bg);
    box-shadow: inset 0 0 0 var(--sel-ring-w) var(--sel-ring);
    z-index: 1;
  }
  .cell.given.selected {
    background: var(--sel-bg);
  }
  .cell.conflict {
    background: var(--conflict-bg);
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
    animation: blocked 300ms ease-out;
  }

  .cell.t-add,
  .cell.tick-add,
  .cell.t-rem,
  .cell.tick-rem {
    z-index: 2;
  }
  .cell.t-add,
  .cell.tick-add {
    box-shadow: inset 0 0 0 2px var(--sel-ring);
  }
  .cell.t-rem,
  .cell.tick-rem {
    box-shadow: inset 0 0 0 2px var(--conflict);
  }
  .cell.tick-add,
  .cell.tick-rem {
    animation: tick 700ms ease-out forwards;
  }
  .cell.tick-add {
    --tick: var(--sel-ring);
  }
  .cell.tick-rem {
    --tick: var(--conflict);
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
    animation: undo-target var(--ring-ms, 620ms) cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  @keyframes tick {
    0%,
    55% {
      box-shadow: inset 0 0 0 2px var(--tick);
    }
    100% {
      box-shadow: inset 0 0 0 2px transparent;
    }
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

    /* Prototype: conflict fill wins over same-digit yellow, including givens. */
    .cell.same.conflict,
    .cell.same.given.conflict {
      background: var(--conflict-bg);
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

  :global(html.kp-freeze) .cell.tick-add,
  :global(html.kp-freeze) .cell.tick-rem {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell.blocked {
      animation: none;
      background-color: color-mix(in srgb, var(--undo-ring) 24%, var(--board-bg));
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--undo-ring) 70%, transparent);
    }
    .cell.tick-add,
    .cell.tick-rem {
      animation: none;
    }
    .cell.undo-target::before {
      animation: none;
    }
  }
</style>
