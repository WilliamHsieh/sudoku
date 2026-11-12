<script>
  import { tick } from "svelte";
  import Icon from "../journal/Icon.svelte";
  import BoardPreview from "./BoardPreview.svelte";
  import { formatTime } from "../store.js";
  import { listTabs, tabItems } from "./list-tabs.js";
  /** @typedef {{puzzle: {digits: string}, index: number, name: string, state: string, solvedAt: number | null, solveMs: number | null, bestMs?: number, active: {effectiveMs: number, updatedAt: number, answers: string | null} | null, openedAt?: number, playedAt?: number, source?: string | null}} Item */
  /** @type {{list: {items: Item[], nextIndex: number | null}, custom: boolean, onpuzzle: (item: any) => void, onnew: () => void}} */
  let { list, custom, onpuzzle, onnew } = $props();
  let tab = $state("All");
  let picked = $state.raw(/** @type {Item | null} */ (null));
  let wallEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let dockEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  const wall = $derived(!custom && (tab === "All" || tab === "Unsolved"));
  const shown = $derived(tabItems(list.items, tab, custom));
  const blocks = $derived(
    shown.reduce((all, item) => {
      const start = Math.floor((item.index - 1) / 50) * 50 + 1;
      if (all.at(-1)?.start !== start) all.push({ start, items: [] });
      all.at(-1).items.push(item);
      return all;
    }, /** @type {{start: number, items: Item[]}[]} */ ([]))
  );
  const date = (at) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = (ms) => formatTime(Math.floor((ms ?? 0) / 1000));
  const status = (item) =>
    ({
      unsolved: "未解",
      solved: `已解 · ${time(item.solveMs)}`,
      in_progress: `進行中 · ${time(item.active?.effectiveMs)}`,
      replaying: `重玩中 · ${time(item.active?.effectiveMs)}`,
    })[item.state];
  const sub = (item) =>
    item.state === "replaying"
      ? `最佳 ${time(item.bestMs)}`
      : custom
        ? `${date(item.openedAt)}${item.source ? ` · ${item.source}` : ""}`
        : date(item.solvedAt ?? item.active.updatedAt);
  /** Keep a tile clear of the dock (the info bar, or Next on open). @param {number} index */
  async function reveal(index) {
    await tick();
    const tile = wallEl?.querySelector(`[data-index="${index}"]`);
    const page = wallEl?.closest(".bank-pages");
    if (!tile || !dockEl || !page) return;
    const t = tile.getBoundingClientRect();
    const d = dockEl.getBoundingClientRect();
    if (t.right > d.left && t.bottom > d.top - 12) page.scrollTop += t.bottom - d.top + 12;
  }
  function choose(name) {
    tab = name;
    picked = null;
    wallEl?.closest(".bank-pages")?.scrollTo({ top: 0 });
  }
  function pick(item) {
    picked = item;
    void reveal(item.index);
  }
  $effect(() => {
    if (wallEl && list.nextIndex) void reveal(list.nextIndex);
  });
</script>

<div class="d-top">
  <div class="tabs" role="tablist" aria-label="篩選">
    {#each listTabs(custom) as name (name)}<button
        role="tab"
        aria-selected={tab === name}
        class:on={tab === name}
        onclick={() => choose(name)}
        >{name} <small>{tabItems(list.items, name, false).length}</small></button
      >{/each}
  </div>
</div>
{#if wall}
  <div class="wall" class:side={picked} bind:this={wallEl}>
    {#each blocks as block (block.start)}<section class="blk">
        <h2>{block.start}–{block.start + 49}</h2>
        <div class="tiles">
          {#each block.items as item (item.index)}<button
              class="t"
              class:done={item.state === "solved"}
              class:prog={item.state === "in_progress"}
              class:redo={item.state === "replaying"}
              class:next={item.index === list.nextIndex}
              class:picked={item.index === picked?.index}
              data-index={item.index}
              aria-label={`${item.name}，${status(item)}`}
              aria-pressed={item.index === picked?.index}
              onclick={() => pick(item)}>{item.index}</button
            >{/each}
        </div>
      </section>{/each}
  </div>
{:else}
  <div class="cards">
    {#if shown.length}<div class="gal">
        {#each shown as item (item.index)}<button
            class="cd"
            class:s-done={item.state === "solved"}
            class:s-prog={item.state === "in_progress"}
            class:s-redo={item.state === "replaying"}
            aria-label={`${item.name}，${status(item)}`}
            onclick={() => onpuzzle(item)}
            ><BoardPreview
              givens={item.puzzle.digits}
              answers={item.active?.answers}
              solved={item.state === "solved"}
            /><span class="meta"
              ><span
                ><b>{item.name}</b><span class="s">{status(item)}</span><span>{sub(item)}</span
                ></span
              ><span class="st"
                ><Icon name={item.state === "in_progress" ? "circle-play" : "circle-check"} /></span
              ></span
            ></button
          >{/each}
      </div>{:else if tab === "In progress"}<p class="empty">
        <b>{custom ? "還沒有進行中的自訂題" : "這一級還沒有進行中的題"}</b
        >開始一題、玩到一半離開，就會出現在這裡。
      </p>{:else if tab === "Solved"}<p class="empty">
        <b>{custom ? "還沒有解完的自訂題" : "這一級還沒有解完的題"}</b
        >解完的題會出現在這裡，之後可以重玩。
      </p>{/if}
  </div>
{/if}
<div class="dock" class:side={picked} bind:this={dockEl}>
  {#if picked}{@const item = picked}
    <div class="pv" role="region" aria-label={item.name}>
      <BoardPreview
        givens={item.puzzle.digits}
        answers={item.active?.answers}
        solved={item.state === "solved"}
      />
      <div class="tx">
        <b>{item.name}</b><span class="d"
          >{#if item.state === "unsolved"}未解{:else}<em class:ok={item.state === "solved"}
              >{status(item)}</em
            >{#if item.state === "replaying"}
              · 最佳 {time(item.bestMs)}{/if}{/if}</span
        ><span class="d"
          >{item.state === "unsolved"
            ? "還沒開始"
            : item.state === "in_progress"
              ? `上次玩 ${date(item.active.updatedAt)}`
              : `解於 ${date(item.solvedAt)}`}</span
        >{#if item.state === "solved" || item.state === "replaying"}<button
            class="pk-btn"
            onclick={() => onpuzzle(item)}>看已解盤面</button
          >{:else}<button class="pk-btn pri" onclick={() => onpuzzle(item)}
            ><Icon name="play" />{item.state === "unsolved" ? "開始" : "繼續"}</button
          >{/if}<button class="pk-x" aria-label="關閉" onclick={() => (picked = null)}
          ><Icon name="x" /></button
        >
      </div>
    </div>{/if}
  {#if custom}<button class="go plus" onclick={onnew}><Icon name="plus" />New custom puzzle</button
    >{:else if list.nextIndex}<button
      class="go"
      onclick={() => onpuzzle(list.items[list.nextIndex - 1])}
      ><Icon name="play" />Next: 第 {list.nextIndex} 題</button
    >{/if}
</div>

<style>
  button {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  .d-top {
    position: sticky;
    top: 44px;
    z-index: 4;
    background: var(--page);
    padding: 0 16px;
    border-bottom: 1px solid var(--hair);
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    flex: 1;
    height: 44px;
    text-align: center;
    font: 600 14px/1 var(--ui-font);
    color: var(--ink2);
    border-bottom: 2.5px solid transparent;
    font-variant-numeric: tabular-nums;
  }
  .tabs small {
    display: block;
    margin-top: 4px;
    font: 500 12px/1 var(--ui-font);
  }
  .tabs .on {
    color: var(--ink);
    border-bottom-color: var(--ink);
  }
  .tabs button:not(.on):hover {
    color: var(--ink);
  }
  .wall {
    padding: 16px 16px 120px;
  }
  .wall.side {
    padding-bottom: 210px;
  }
  .blk {
    margin: 0 0 14px;
  }
  h2 {
    margin: 0 0 6px 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink2);
    font-variant-numeric: tabular-nums;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 4px;
  }
  .t {
    position: relative;
    height: 34px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    font:
      700 13px/1 "Atkinson Hyperlegible",
      var(--ui-font);
    font-variant-numeric: tabular-nums;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
    color: var(--ink2);
  }
  .t:hover {
    background: var(--neutral-2);
  }
  .t.done {
    background: var(--cue-fill);
    box-shadow: none;
    color: var(--cue-ink);
  }
  .t.prog {
    background: var(--sel);
    box-shadow: inset 0 0 0 2px var(--blue);
    color: var(--blue-d);
  }
  .t.redo {
    background: var(--cue-fill);
    box-shadow: inset 0 0 0 2px var(--blue);
    color: var(--cue-ink);
  }
  .t.next {
    background: var(--card);
    box-shadow: inset 0 0 0 2px var(--ink);
    color: var(--ink);
  }
  .t.next::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 4px;
    width: 10px;
    height: 2px;
    margin-left: -5px;
    border-radius: 1px;
    background: var(--ink);
  }
  .t.prog::before,
  .t.redo::before {
    content: "";
    position: absolute;
    top: 4px;
    right: 4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--blue);
  }
  .t:focus-visible,
  .t.picked,
  .cd:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .cards {
    padding: 14px 16px 120px;
  }
  .gal {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .cd {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 14px;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
    content-visibility: auto;
    contain-intrinsic-size: auto 240px;
  }
  .cd:hover {
    background: var(--neutral-2);
  }
  .meta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20px;
    align-items: start;
    gap: 6px;
    padding: 0 2px;
  }
  .meta b {
    display: block;
    font-size: 16px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta span span {
    display: block;
    margin-top: 3px;
    font-size: 13px;
    color: var(--ink2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta .s {
    font-weight: 600;
    color: var(--ink);
  }
  .s-prog .s,
  .s-redo .s {
    color: var(--blue-d);
  }
  .st {
    display: flex;
    --ic: 20px;
    color: var(--sv-sep);
  }
  .s-done .st,
  .s-redo .st {
    color: var(--cue-ink);
  }
  .s-prog .st {
    color: var(--blue);
  }
  .empty {
    margin: 48px 4px 0;
    max-width: 22em;
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink2);
  }
  .empty b {
    display: block;
    margin-bottom: 6px;
    font-size: 19px;
    color: var(--ink);
  }
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 7;
    background: var(--page);
    border-top: 1px solid var(--hair);
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }
  .go {
    width: 100%;
    height: 48px;
    border-radius: 12px;
    background: var(--blue);
    color: var(--on-accent);
    font: 600 16px/1 var(--ui-font);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    --ic: 17px;
  }
  .go:hover {
    background: var(--blue-d);
  }
  .go :global(svg) {
    fill: currentColor;
    stroke: none;
  }
  .go.plus :global(svg) {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
  }
  .pv {
    display: grid;
    grid-template-columns: 118px minmax(0, 1fr);
    gap: 14px;
    margin: 0 0 12px;
    animation: up 260ms var(--ease-out);
  }
  @keyframes up {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
  }
  .tx {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tx b {
    font-size: 17px;
    font-weight: 700;
    padding-right: 40px;
  }
  .tx .d {
    margin-top: 3px;
    font-size: 14px;
    color: var(--ink2);
    font-variant-numeric: tabular-nums;
  }
  em {
    font-style: normal;
    font-weight: 600;
    color: var(--blue-d);
  }
  em.ok {
    color: var(--cue-ink);
  }
  .pk-btn {
    margin-top: auto;
    height: 40px;
    border-radius: 10px;
    background: var(--neutral);
    font: 600 14px/1 var(--ui-font);
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    --ic: 15px;
  }
  .pk-btn:hover {
    background: var(--neutral-hover);
  }
  .pk-btn.pri {
    background: var(--sel);
    color: var(--blue-d);
  }
  .pk-btn.pri :global(svg) {
    fill: currentColor;
    stroke: none;
  }
  .pk-x {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: var(--ink2);
    --ic: 18px;
  }
  .pk-x:hover {
    background: var(--neutral-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .pv {
      animation: none;
    }
  }
  @media (min-width: 600px) {
    .d-top {
      top: 64px;
      padding: 8px 32px 0;
    }
    .tabs {
      max-width: 560px;
    }
    .wall {
      padding: 24px 32px 120px;
    }
    .wall.side {
      padding-right: 400px;
    }
    .tiles {
      grid-template-columns: repeat(25, minmax(0, 1fr));
      gap: 5px;
      max-width: 860px;
    }
    .t {
      height: 38px;
      font-size: 14px;
    }
    h2 {
      font-size: 13px;
    }
    .cards {
      max-width: 1216px;
      margin: 0 auto;
      padding: 24px 32px 120px;
    }
    .gal {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 16px;
    }
    .dock {
      padding: 14px 32px;
      display: flex;
      justify-content: center;
    }
    .go {
      max-width: 360px;
    }
    .dock.side {
      left: auto;
      right: 32px;
      top: 148px;
      bottom: auto;
      width: 340px;
      flex-direction: column;
      align-items: stretch;
      border: 1px solid var(--hair);
      border-radius: 16px;
      background: var(--card);
      padding: 18px;
    }
    .dock.side .go {
      max-width: none;
    }
  }
</style>
