<script>
  import { tick } from "svelte";
  import { supplementalCoordinates, tokenizeCoordinates } from "./coordinate-text.js";
  import { createHintStoryGesture } from "./story-navigation.js";
  /** @type {{session: ReturnType<typeof import('./session.svelte.js').createHintSession>, onclose: () => void, oncoordinate: (cell: number) => void, docked: boolean}} */
  let { session, onclose, oncoordinate, docked } = $props();
  let body = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  const storyGesture = createHintStoryGesture();
  const step = $derived(session.status === "ready" ? session.hint?.stages[session.stage] : null);
  const supplemental = $derived(
    step ? supplementalCoordinates(step, session.stage === 2 ? session.hint?.effect : "") : ""
  );
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
    !session.didApply
      ? "這一步的結果已經在盤面上，請繼續解題。"
      : session.hint?.placements.length
        ? session.hint.placements
            .map((p) => `已在 r${Math.floor(p.cell / 9) + 1}c${(p.cell % 9) + 1} 填入 ${p.digit}。`)
            .join("")
        : `已刪除 ${session.hint?.eliminations.length ?? 0} 個候選數。請繼續觀察刪除後的盤面。`
  );
  const retry = $derived(["empty", "error", "stale"].includes(session.status));
  /** @param {PointerEvent} event */
  function storyPress(event) {
    const interactive =
      event.target instanceof Element &&
      event.target.closest(
        'button, a, input, textarea, select, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])'
      );
    return {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      stage: session.stage,
      allowed:
        !!step &&
        event.isPrimary &&
        event.button === 0 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !interactive &&
        window.getSelection()?.isCollapsed !== false,
    };
  }
  /** @param {PointerEvent} event */
  function finishStoryTap(event) {
    if (!body) return;
    const { left, top } = body.getBoundingClientRect();
    // Leave the scrollbar gutter to native scrolling, not story navigation.
    const { clientWidth: width, clientHeight: height } = body;
    const direction = storyGesture.finish({ ...storyPress(event), left, top, width, height });
    if (direction < 0) session.previous();
    else if (direction > 0) session.next();
  }
  $effect(() => {
    session.stage;
    session.status;
    storyGesture.cancel();
    void tick().then(() => body?.scrollTo(0, 0));
  });
</script>

{#snippet coordinateText(text)}
  {#each tokenizeCoordinates(text) as token, index (index)}{#if token.type === "coordinate"}<button
        type="button"
        class="hint-reference"
        data-cell={token.cell}
        aria-label={`在棋盤上查看 ${token.text}（第 ${Math.floor(token.cell / 9) + 1} 橫列、第 ${(token.cell % 9) + 1} 直行）`}
        onclick={() => oncoordinate(token.cell)}>{token.text}</button
      >{:else}{token.text}{/if}{/each}
{/snippet}

<aside
  id="hint-panel"
  class="hint-panel"
  class:docked
  aria-label="提示"
  aria-busy={session.status === "searching"}
>
  <div class="hint-head">
    <span>提示{step ? ` · ${["觀察", "推理", "結論"][session.stage]}` : ""}</span>
    {#if step}
      <div class="hint-navigation" role="group" aria-label="切換提示步驟">
        <button
          type="button"
          class="hint-stage-arrow"
          data-action="previous-stage"
          aria-label="上一個提示"
          title="上一個提示"
          disabled={session.stage === 0}
          onclick={() => session.previous()}>‹</button
        >
        <span class="hint-position" aria-live="polite" aria-atomic="true"
          >{session.stage + 1}/3</span
        >
        <button
          type="button"
          class="hint-stage-arrow"
          data-action="next-stage"
          aria-label="下一個提示"
          title="下一個提示"
          disabled={session.stage === 2}
          onclick={() => session.next()}>›</button
        >
      </div>
    {:else}<span class="hint-position"></span>{/if}
    <button class="hint-close" aria-label="收起提示" onclick={onclose}>×</button>
  </div>
  {#if step}
    <div class="hint-progress" aria-label={`第 ${session.stage + 1} 步，共 3 步`}>
      {#each [0, 1, 2] as n (n)}<span class:done={n <= session.stage}></span>{/each}
    </div>
  {/if}
  <!-- The native header buttons provide keyboard access; this region keeps native scrolling/selection. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="hint-body"
    bind:this={body}
    tabindex="0"
    role="region"
    aria-label="提示說明"
    onpointerdown={(event) => storyGesture.start(storyPress(event))}
    onpointermove={(event) => storyGesture.move(event.pointerId, event.clientX, event.clientY)}
    onpointerup={finishStoryTap}
    onpointercancel={() => storyGesture.cancel()}
    onpointerleave={() => storyGesture.cancel()}
    onscroll={() => storyGesture.cancel()}
  >
    {#if step}
      {#if session.stage === 1}<div class="technique">{session.hint?.name}</div>{/if}
      <h2>{@render coordinateText(step.title)}</h2>
      {#each step.description as text, index (index)}<p>{@render coordinateText(text)}</p>{/each}
      {#if supplemental}<p>{@render coordinateText(supplemental)}</p>{/if}
      {#if session.stage === 2}
        <div
          class="hint-effect"
          class:hint-effect-placement={!!session.hint?.placements.length &&
            !session.hint?.eliminations.length}
        >
          {@render coordinateText(session.hint?.effect ?? "")}
        </div>
      {/if}
    {:else}
      <h2 aria-live="polite">{message[0]}</h2>
      <p>{@render coordinateText(session.status === "applied" ? complete : message[1])}</p>
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
  .hint-navigation {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .hint-stage-arrow {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 6px;
    padding: 0;
    background: transparent;
    color: var(--ui-ink);
    font-size: 24px;
  }
  .hint-stage-arrow:hover:not(:disabled) {
    background: var(--sel-bg);
  }
  .hint-stage-arrow:disabled {
    opacity: 0.35;
    cursor: default;
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
  .hint-reference {
    display: inline-block;
    min-height: 24px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    line-height: inherit;
    vertical-align: baseline;
    white-space: nowrap;
    text-decoration: underline;
    text-decoration-color: var(--blue);
    text-underline-offset: 0.16em;
  }
  .hint-reference:hover,
  .hint-reference:active {
    background: var(--sel-bg);
  }
  .hint-effect {
    padding: 10px 12px;
    background: var(--conflict-bg);
    color: var(--conflict);
    border-radius: 8px;
    font-size: 14px;
    margin-top: 12px;
  }
  .hint-effect-placement {
    background: var(--cue-fill);
    color: var(--cue-ink);
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
