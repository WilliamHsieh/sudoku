<script>
  import { DIFF_LABEL, DIFF_LEVEL } from "./format.js";

  /** @type {{ diff: 'easy' | 'medium' | 'hard', size?: number }} */
  let { diff, size = 14 } = $props();

  const w = $derived(size);
  const h = $derived(Math.round(size * 0.86));
  const bw = $derived(w * 0.26);
  const gap = $derived((w - 3 * bw) / 2);
  const level = $derived(DIFF_LEVEL[diff]);
</script>

<span class="diff">
  <svg class="dg" width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}
      {@const bh = h * (0.42 + 0.29 * i)}
      <rect
        x={(i * (bw + gap)).toFixed(2)}
        y={(h - bh).toFixed(2)}
        width={bw.toFixed(2)}
        height={bh.toFixed(2)}
        rx="1"
        fill={i < level ? "var(--ui-ink)" : "var(--dot-idle)"}
      ></rect>
    {/each}
  </svg>
  <span>{DIFF_LABEL[diff]}</span>
</span>

<style>
  .diff {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .dg {
    flex: none;
  }
</style>
