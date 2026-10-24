<script>
  import Icon from "./Icon.svelte";
  import DiffLabel from "./DiffLabel.svelte";
  import { formatTime } from "../store.js";
  import { fmtTime } from "./format.js";

  /**
   * @type {{
   *   time?: import('svelte').Snippet<[number]>,
   *   diff: 'easy' | 'medium' | 'hard',
   *   st: import('./stats.js').PuzzleState,
   *   avg?: number | null,
   *   isPb?: boolean,
   *   inPlay?: number | null,
   *   onplay?: () => void,
   * }}
   */
  let { diff, st, avg = null, isPb = false, inPlay = null, onplay, time } = $props();

  const delta = $derived(st.kind === "solved" && avg != null ? st.time - avg : 0);
</script>

{#snippet defaultTime(seconds)}{fmtTime(seconds)}{/snippet}

<div class="prow">
  {#if st.kind === "solved"}
    <div>
      <DiffLabel {diff} />
      <div class="s num">
        {#if isPb}
          <span class="pb"><Icon name="trophy" />Personal best</span>
        {:else if avg != null}
          {@render (time ?? defaultTime)(Math.abs(delta))}
          {delta < 0 ? "faster" : "slower"} than average
        {/if}
      </div>
    </div>
    <span class="tm num"><Icon name="check" />{@render (time ?? defaultTime)(st.time)}</span>
  {:else if st.kind === "progress"}
    <div>
      <DiffLabel {diff} />
      <div class="s num">{@render (time ?? defaultTime)(st.elapsed)} played · {st.pct}% filled</div>
      <div class="bar"><i style="width:{st.pct}%"></i></div>
    </div>
    {#if inPlay !== null}
      <span class="cur-tag" aria-label={`In play, ${formatTime(inPlay)}`}
        >In play · {formatTime(inPlay)}</span
      >
    {:else}
      <button class="btn btn-primary" type="button" onclick={onplay}
        ><Icon name="play" />Resume</button
      >
    {/if}
  {:else}
    <div>
      <DiffLabel {diff} />
      <div class="s">Not started</div>
    </div>
    <button class="btn btn-quiet" type="button" onclick={onplay}><Icon name="play" />Start</button>
  {/if}
</div>

<style>
  .cur-tag {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 12px;
    border-radius: 9px;
    font: 600 13px/1 var(--ui-font);
    color: var(--ink2);
    box-shadow: inset 0 0 0 1px var(--hair);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .prow {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
    min-height: 72px;
  }
  .prow + :global(.prow) {
    border-top: 1px solid var(--neutral-2);
  }
  .s {
    margin-top: 4px;
    font-size: 13px;
    color: var(--ink2);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .pb {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: var(--ink);
    --ic: 14px;
  }
  .tm {
    font-size: 17px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    --ic: 16px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--neutral);
    margin-top: 8px;
    width: 100%;
    max-width: 150px;
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--amber);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 15px;
    white-space: nowrap;
    transition: background-color 0.12s;
    font-family: inherit;
    color: inherit;
    background: none;
    border: 0;
    cursor: pointer;
    --ic: 16px;
  }
  .btn-primary {
    background: var(--blue);
    color: #fff;
  }
  .btn-primary:hover {
    background: var(--blue-d);
  }
  .btn-quiet {
    background: var(--neutral);
    color: var(--ink);
  }
  .btn-quiet:hover {
    background: #dbdad5;
  }
</style>
