<script>
  import PenBox from "./PenBox.svelte";
  import PencilBox from "./PencilBox.svelte";
  import { game } from "./game/game.svelte.js";

  /** @type {{ cell_id: number }} */
  let { cell_id } = $props();
  const walls = $derived.by(() => {
    const x = Math.floor(cell_id / 9);
    const y = cell_id % 9;
    return (
      "cell" +
      (x % 3 == 0 ? " top-wall" : "") +
      (y % 3 == 0 ? " left-wall" : "") +
      (x == 8 && (x + 1) % 3 == 0 ? " bottom-wall" : "") +
      (y == 8 && (y + 1) % 3 == 0 ? " right-wall" : "")
    );
  });

  let isShiftPressed = $state(false);
  let cellElement = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let closestPencilIdx = $state(-1);

  const value = $derived(game.value(cell_id));
  const given = $derived(game.given(cell_id));
  const selected = $derived(game.selected === cell_id);
  const focusedValue = $derived(game.selected === -1 ? 0 : game.value(game.selected));
  const cellStyle = $derived.by(() => {
    let fg = "#374151";
    let bg = "white";

    if (given) bg = "#e2e8f0";
    if (value == 0) {
      fg = "#6b7280";
    } else if (focusedValue != 0 && focusedValue == value) {
      bg = "#fde68a";
      fg = "#374151";
    }
    if (selected) {
      bg = "#3b82f6";
      fg = "white";
    }

    return `background-color: ${bg}; color: ${fg}`;
  });

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
  class={walls}
  style={cellStyle}
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
      {#each Array(9) as _, idx}
        <PencilBox
          {cell_id}
          {idx}
          {isShiftPressed}
          isClosest={closestPencilIdx === idx}
        />
      {/each}
    </div>
  {/if}
</div>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<style>
  .cell {
    aspect-ratio: 1;
    border: 0.25px solid #6b7280;
    transition: all 0.15s ease;
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    min-height: 60px;
    padding: 2px;
  }

  .candidate {
    height: 100%;
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 1px;
  }

  .top-wall {
    border-top: 5px solid #374151;
  }
  .bottom-wall {
    border-bottom: 5px solid #374151;
  }
  .left-wall {
    border-left: 5px solid #374151;
  }
  .right-wall {
    border-right: 5px solid #374151;
  }
</style>
