<script>
  import PenBox from "./PenBox.svelte";
  import PencilBox from "./PencilBox.svelte";
  import { game } from "./game/game.svelte.js";

  /** @type {{ cell_id: number }} */
  let { cell_id } = $props();
  const NOTE_SLOTS = Array.from({ length: 9 }, (_, i) => i);
  const row = $derived(Math.floor(cell_id / 9));
  const col = $derived(cell_id % 9);

  let isShiftPressed = $state(false);
  let cellElement = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let closestPencilIdx = $state(-1);

  const value = $derived(game.value(cell_id));
  const given = $derived(game.given(cell_id));
  const selected = $derived(game.selected === cell_id);
  const focusedValue = $derived(game.selected === -1 ? 0 : game.value(game.selected));
  const same = $derived(value !== 0 && focusedValue === value);
  const conflict = $derived(game.inConflict(cell_id));

  function handleKeyDown(e) {
    if (e.key === "Shift") {
      isShiftPressed = true;
    }
  }

  function handleKeyUp(e) {
    if (e.key === "Shift") {
      isShiftPressed = false;
      closestPencilIdx = -1;
    }
  }

  function handleMouseMove(e) {
    if (!isShiftPressed || !cellElement || value !== 0) return;

    const rect = cellElement.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;

    const pencilWidth = rect.width / 3;
    const pencilHeight = rect.height / 3;

    const gridX = Math.floor(relativeX / pencilWidth);
    const gridY = Math.floor(relativeY / pencilHeight);

    const newClosestIdx = Math.min(Math.max(gridY * 3 + gridX, 0), 8);

    if (game.hasNote(cell_id, newClosestIdx + 1)) {
      closestPencilIdx = newClosestIdx;
    } else {
      closestPencilIdx = -1;
    }
  }

  function handleMouseLeave() {
    closestPencilIdx = -1;
  }

  function handleRightClick() {
    // Same as master: only the selected non-given cell.
    if (game.selected == cell_id && !game.given(cell_id)) {
      game.clear(cell_id);
    }
  }

  function handleClick() {
    game.select(cell_id);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  bind:this={cellElement}
  class="cell"
  class:given
  class:selected
  class:same
  class:conflict
  class:user={value !== 0 && !given}
  data-r={row}
  data-c={col}
  onclick={handleClick}
  oncontextmenu={(e) => {
    e.preventDefault();
    handleRightClick();
  }}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
>
  {#if value}
    <PenBox {cell_id} />
  {:else}
    <div class="candidate">
      {#each NOTE_SLOTS as idx (idx)}
        <PencilBox {cell_id} {idx} {isShiftPressed} isClosest={closestPencilIdx === idx} />
      {/each}
    </div>
  {/if}
</div>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

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
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
  }
</style>
