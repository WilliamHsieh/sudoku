<script>
  import { tick } from "svelte";
  /** @type {{session: ReturnType<typeof import('./session.svelte.js').createHintSession>, onclose: () => void, oncoordinate: (cell: number) => void, docked: boolean}} */
  let { session, onclose, oncoordinate, docked } = $props();
  let body = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  const step = $derived(session.status === "ready" ? session.hint?.stages[session.stage] : null);
  const messages = {
    unavailable: ["提示功能準備中", "目前尚未開放提示，請先繼續解題。"],
    searching: ["正在尋找提示…", "先從簡單技巧開始尋找。"],
    empty: ["暫時找不到提示", "目前沒有找到可用的下一步，試著換個區域觀察。"],
    error: ["這次沒能取得提示", "請再試一次。"],
    stale: ["盤面已變更", "請重新尋找符合目前盤面的提示。"],
    applied: ["這一步已完成", ""],
    closed: ["", ""],
    ready: ["", ""],
  };
  const message = $derived(messages[session.status]);
  const complete = $derived(
    !session.undoAvailable
      ? "這一步的結果已經在盤面上，請繼續解題。"
      : session.hint?.placements.length
        ? session.hint.placements
            .map((p) => `已在 r${Math.floor(p.cell / 9) + 1}c${(p.cell % 9) + 1} 填入 ${p.digit}。`)
            .join("")
        : `已刪除 ${session.hint?.eliminations.length ?? 0} 個候選數。請繼續觀察刪除後的盤面。`
  );
  const retry = $derived(["empty", "error", "stale"].includes(session.status));
  $effect(() => {
    session.stage;
    session.status;
    void tick().then(() => body?.scrollTo(0, 0));
  });
</script>

<aside
  id="hint-panel"
  class="hint-panel"
  class:docked
  aria-label="提示"
  aria-busy={session.status === "searching"}
>
  <div class="hint-head">
    <span>提示{step ? ` · ${["觀察", "推理", "結論"][session.stage]}` : ""}</span>
    <span class="hint-position">{step ? `${session.stage + 1}/3` : ""}</span>
    <button class="hint-close" aria-label="收起提示" onclick={onclose}>×</button>
  </div>
  {#if step}
    <div class="hint-progress" aria-label={`第 ${session.stage + 1} 步，共 3 步`}>
      {#each [0, 1, 2] as n (n)}<span class:done={n <= session.stage}></span>{/each}
    </div>
  {/if}
  <!-- Focus allows keyboard users to scroll this region without editing the board. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="hint-body" bind:this={body} tabindex="0" role="region" aria-label="提示說明">
    {#if step}
      {#if session.stage === 1}<div class="technique">{session.hint?.name}</div>{/if}
      <h2>{step.title}</h2>
      {#each step.description as text, index (index)}<p>{text}</p>{/each}
      {#if step.coordinates.length}
        <div class="hint-coordinates">
          {#each step.coordinates as cell (cell)}
            <button
              class="hint-coordinate"
              data-cell={cell}
              aria-label={`查看第 ${Math.floor(cell / 9) + 1} 橫列、第 ${(cell % 9) + 1} 直行`}
              onclick={() => oncoordinate(cell)}
              >r{Math.floor(cell / 9) + 1}c{(cell % 9) + 1}</button
            >
          {/each}
        </div>
      {/if}
      {#if session.stage === 2}<div class="hint-effect">{session.hint?.effect}</div>{/if}
    {:else}
      <h2 aria-live="polite">{message[0]}</h2>
      <p>{session.status === "applied" ? complete : message[1]}</p>
    {/if}
  </div>
  <div class="hint-footer">
    <div class="hint-actions">
      {#if session.status === "applied" && session.undoAvailable}
        <button
          class="hint-secondary"
          data-action="undo"
          onclick={() => {
            session.undo();
            onclose();
          }}>復原這一步</button
        >
      {:else if step || retry || session.status === "searching"}
        <button class="hint-secondary" data-action="close" onclick={onclose}
          >{step ? "我自己試試" : "回到棋盤"}</button
        >
      {:else}<span></span>{/if}
      {#if step}
        <button
          class="hint-primary"
          data-action={session.stage === 2 ? "apply" : "next"}
          onclick={() => (session.stage === 2 ? session.apply() : session.next())}
          >{session.stage === 2
            ? "套用這一步"
            : session.stage === 1
              ? "查看結論"
              : "再提示一點"}</button
        >
      {:else if retry}
        <button class="hint-primary" data-action="retry" onclick={() => session.open()}
          >再找一次</button
        >
      {:else if session.status !== "searching"}
        <button class="hint-primary" data-action="close" onclick={onclose}>回到棋盤</button>
      {/if}
    </div>
  </div>
</aside>

<style>
  .hint-panel {
    box-sizing: border-box;
    width: 100%;
    max-height: var(--hint-max-height, none);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 20px;
    background: var(--board-bg);
    border: 1px solid var(--hair);
    border-radius: 12px;
    color: var(--ui-ink);
    font-family: var(--ui-font);
  }
  .hint-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    font-size: 13px;
    color: var(--ui-soft);
    margin-bottom: 12px;
    flex: none;
  }
  .hint-head > :first-child {
    justify-self: start;
  }
  .hint-position {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  button {
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible,
  .hint-body:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  .hint-close {
    justify-self: end;
    border: 0;
    background: transparent;
    color: var(--ui-soft);
    font-size: 22px;
    padding: 0;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
  }
  .hint-progress {
    display: flex;
    gap: 5px;
    margin-bottom: 16px;
    flex: none;
  }
  .hint-progress span {
    height: 3px;
    background: var(--hair);
    border-radius: 3px;
    flex: 1;
  }
  .hint-progress .done {
    background: var(--blue);
  }
  h2 {
    font-size: 21px;
    line-height: 1.4;
    font-weight: 600;
    margin: 0 0 12px;
  }
  p {
    font-size: 16px;
    line-height: 1.7;
    margin: 8px 0;
  }
  .technique {
    font-size: 12px;
    color: var(--blue);
    margin-bottom: 8px;
  }
  .hint-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
  }
  .hint-primary,
  .hint-secondary {
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 14px;
    padding: 8px 12px;
    min-height: 44px;
  }
  .hint-primary {
    background: var(--primary);
    color: var(--on-accent);
  }
  .hint-secondary {
    border-color: var(--hair);
    background: transparent;
    color: var(--ui-ink);
  }
  .hint-coordinates {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .hint-coordinate {
    padding: 6px 9px;
    border: 1px solid var(--hair);
    border-radius: 6px;
    background: var(--sel-bg);
    color: var(--blue);
    font-size: 12px;
  }
  .hint-effect {
    padding: 10px 12px;
    background: var(--conflict-bg);
    color: var(--conflict);
    border-radius: 8px;
    font-size: 14px;
    margin-top: 12px;
  }
  .docked {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
  }
  .hint-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    flex: 1;
  }
  .docked .hint-head,
  .docked .hint-progress {
    margin-bottom: 8px;
  }
  .hint-footer {
    flex: none;
  }
  .docked .hint-actions {
    margin-top: 12px;
  }
  .docked h2 {
    font-size: 20px;
  }
  .docked p {
    line-height: 1.6;
  }
  .hint-body > :first-child {
    margin-top: 0;
  }
  .hint-body > :last-child {
    margin-bottom: 12px;
  }
</style>
