<script>
  /** @typedef {'solved' | 'progress' | 'none'} MarkKind */

  /**
   * E·M·H squares. `pos` highlights one of three (1024 strip).
   * @type {{ kinds?: MarkKind[], size?: number, gap?: number, pos?: number }}
   */
  let { kinds, size = 9, gap = 3, pos = /** @type {number | undefined} */ (undefined) } = $props();

  /** @param {MarkKind} kind */
  function fill(kind) {
    if (kind === "solved") return "var(--ink)";
    if (kind === "progress") return "var(--same-digit)";
    return "none";
  }

  /** @param {MarkKind} kind */
  function stroke(kind) {
    if (kind === "progress") return "var(--same-digit-ink)";
    if (kind === "none") return "var(--line-box)";
    return "none";
  }

  /** @param {MarkKind} kind */
  function sw(kind) {
    if (kind === "progress") return 1.5;
    if (kind === "none") return 1.25;
    return 0;
  }

  const items = $derived(
    pos == null
      ? (kinds ?? /** @type {MarkKind[]} */ (["none", "none", "none"]))
      : [0, 1, 2].map((i) => (i === pos ? "solved" : "none"))
  );
  const w = $derived(items.length * size + Math.max(0, items.length - 1) * gap);
  const rx = $derived(size > 10 ? 2.5 : 2);
</script>

<svg class="mk" width={w} height={size} aria-hidden="true">
  {#each items as kind, i (i)}
    {@const x = i * (size + gap) + 0.75}
    {#if pos != null && i !== pos}
      <rect {x} y="0.75" width={size - 1.5} height={size - 1.5} rx="2" fill="var(--hair)"></rect>
    {:else}
      <rect
        {x}
        y="0.75"
        width={size - 1.5}
        height={size - 1.5}
        {rx}
        fill={fill(kind)}
        stroke={stroke(kind)}
        stroke-width={sw(kind)}
      ></rect>
    {/if}
  {/each}
</svg>
