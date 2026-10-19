<script>
  import { game } from "./game/game.svelte.js";

  /** @type {{ cell_id: number }} */
  let { cell_id } = $props();
  const value = $derived(game.value(cell_id));
  const conflict = $derived(game.inConflict(cell_id));
  const given = $derived(game.given(cell_id));
</script>

<div class="pen-box" class:given>
  {value}
  {#if conflict}
    <div class="conflict"></div>
  {/if}
</div>

<style>
  .pen-box {
    width: 100%;
    height: 100%;
    font-size: calc(var(--cell) * var(--digit-size));
    font-family: var(--digit-font);
    font-weight: var(--answer-weight);
    font-variant-numeric: tabular-nums;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    line-height: 1;
    color: var(--answer-ink);
  }

  .pen-box.given {
    color: var(--given-ink);
    font-weight: var(--given-weight);
  }

  .pen-box:has(.conflict) {
    color: var(--conflict);
  }

  .conflict {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--conflict);
  }

  /* Mobile uses `.cell.conflict::after` (Combo C). Keep the node so
     `:has(.conflict)` still reddens the digit; hide the inner marker. */
  @media (max-width: 599px) {
    .conflict {
      display: none;
    }
  }
</style>
