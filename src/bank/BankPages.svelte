<script>
  import { puzzleData } from "../puzzles.js";
  import { latestPuzzleDay, formatDay } from "../game/daily.js";
  import Icon from "../journal/Icon.svelte";
  import { formatTime } from "../store.js";
  import { LEVELS, levelName, ratingRange, modeName, lockedMessage } from "./ui-copy.js";
  import { showToast } from "../keypad-actions.js";
  import { tick } from "svelte";
  /** @type {{bank: ReturnType<typeof import('./ui-session.svelte.js').createBankUI>, route: string, level: import('./types.js').Level, onnavigate: (route: string) => void, onlevel: (level: import('./types.js').Level) => void, onstart: (mode: import('./types.js').Mode, level?: import('./types.js').Level) => void, onresume: (id: string) => void, oncustom: () => void, ondaily: (puzzle: string, label:string) => void, onpuzzle: (item: ReturnType<ReturnType<typeof import('./ui-session.svelte.js').createBankUI>['list']>['items'][number]) => void}} */
  let { bank, route, level, onnavigate, onlevel, onstart, onresume, oncustom, ondaily, onpuzzle } =
    $props();
  let dailyDate = $state(latestPuzzleDay(puzzleData, formatDay(new Date())));
  const highest = $derived(bank.unlock.maxOpenLevel);
  const count = $derived(Math.min(10, bank.unlock.perLevel[highest].hintFreeSolves));
  const list = $derived(route === "list" && bank.catalog ? bank.list(level) : null);
  let filter = $state("全部");
  let listEl = $state(/** @type {HTMLOListElement} */ (undefined));
  const filtered = $derived(
    list?.items.filter(
      (i) =>
        filter === "全部" ||
        (filter === "未解" && i.state === "unsolved") ||
        (filter === "已解" && i.solvedAt !== null) ||
        (filter === "進行中" && ["in_progress", "replaying"].includes(i.state))
    ) ?? []
  );
  const date = (at) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const active = (item) =>
    bank.attempts
      .filter(
        (a) =>
          a.puzzle.digits === item.puzzle.digits && ["in_progress", "paused"].includes(a.outcome)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const status = (item) =>
    ({
      unsolved: "未解",
      solved: `已解 · ${formatTime(Math.floor(item.solveMs / 1000))}`,
      in_progress: `進行中 · ${formatTime(Math.floor((active(item)?.effectiveMs ?? 0) / 1000))}`,
      replaying: `重玩中 · ${formatTime(Math.floor((active(item)?.effectiveMs ?? 0) / 1000))}`,
    })[item.state];
  $effect(() => {
    void level;
    void route;
    filter = "全部";
  });
  $effect(() => {
    if (listEl && list?.nextIndex) {
      const index = list.nextIndex;
      void tick().then(() => {
        const page = listEl?.closest(".bank-pages");
        const target = listEl?.querySelector(`[data-index="${Math.max(1, index - 2)}"]`);
        const stick = page?.querySelector(".stick");
        if (page && target && stick)
          page.scrollTop +=
            target.getBoundingClientRect().top - stick.getBoundingClientRect().bottom;
      });
    }
  });
  function choose(level) {
    if (level > highest) showToast(lockedMessage(level, highest, count), false, 2600);
    else onlevel(level);
  }
</script>

<div lang="zh-Hant" class="bank-pages" class:puzzle-list={route === "list"}>
  <header class="bar">
    {#if route !== "home"}<button
        class="back"
        aria-label="Back"
        onclick={() => onnavigate(route === "list" ? "levels" : "home")}
        ><Icon name="chevron-left" /></button
      >{/if}
    <h1>
      {route === "home"
        ? "Sudoku"
        : route === "levels"
          ? "Choose L1–L8"
          : route === "unfinished"
            ? "Unfinished"
            : route === "daily"
              ? "NYT daily puzzles"
              : `L${level}`}{#if route === "list"}
        <span>{levelName(level)}</span>{/if}
    </h1>
  </header>
  {#if bank.error}<p role="alert">{bank.error}</p>{/if}
  {#if route === "home"}
    <div class="page home">
      <div class="home-main sheet">
        {#each [["easy", "Easy", "一定解得出來"], ["medium", "Medium", "花一點力氣解出來"], ["hard", "Hard", "有時候會解不出來"]] as [mode, name, gloss] (mode)}
          <button
            class="pick"
            disabled={!bank.catalog || !!bank.error}
            onclick={() => onstart(/** @type {import('./types.js').Mode} */ (mode))}
            ><b>{name}</b><span>{gloss}</span></button
          >
        {/each}
      </div>
      <div class="home-side">
        <div class="sheet two">
          <button
            class="way"
            disabled={!bank.catalog || !!bank.error}
            onclick={() => onnavigate("levels")}
            ><b>Choose L1–L8</b><Icon name="chevron-right" /></button
          >
          {#if bank.slots.length}<button class="way" onclick={() => onnavigate("unfinished")}
              ><b>Unfinished</b><span class="tail"
                >{bank.slots.length}<Icon name="chevron-right" /></span
              ></button
            >{/if}
        </div>
        <button class="custom-entry" aria-label="Custom puzzle" onclick={oncustom}
          ><span class="symbol"><Icon name="grid-3x3" /></span><span class="copy"
            ><b>Custom puzzle</b><span>Enter a board or paste a puzzle</span></span
          ><Icon name="chevron-right" /></button
        >
      </div>
    </div>
  {:else if route === "daily"}
    <div class="page">
      <label
        >Date <input
          aria-label="Puzzle date"
          type="date"
          bind:value={dailyDate}
          min={Object.keys(puzzleData).sort()[0]}
          max={Object.keys(puzzleData).sort().at(-1)}
        /></label
      >
      <div class="sheet">
        {#each ["Easy", "Medium", "Hard"] as name (name)}
          <button
            class="pick"
            disabled={!puzzleData[dailyDate]?.[name.toLowerCase()]}
            onclick={() =>
              ondaily(puzzleData[dailyDate][name.toLowerCase()], `NYT ${dailyDate} · ${name}`)}
            ><b>{name}</b></button
          >
        {/each}
      </div>
    </div>
  {:else if route === "levels"}
    <div class="page">
      <p class="status">
        {#if highest === 8}L1–L8 都解鎖了{:else}{count ? "再解" : "解"} <b>{10 - count}</b> 題 L{highest}，解鎖
          L{highest + 1}{/if}
      </p>
      <ol class="levels">
        {#each LEVELS as n (n)}<li
            class="lv"
            class:locked={n > highest}
            class:cur={n === highest && n < 8}
          >
            <button aria-disabled={n > highest} onclick={() => choose(n)}
              ><span class="n">L{n}</span><span class="copy"
                ><span class="name">{levelName(n)}</span><span class="range">{ratingRange(n)}</span
                >{#if n === highest && n < 8}<span class="prog"
                    ><span class="pips" aria-hidden="true"
                      >{#each Array.from({ length: 10 }, (_, i) => i) as i (i)}<i
                          class:on={i < count}
                        ></i>{/each}</span
                    ><span class="cnt">{count}/10</span></span
                  >{/if}</span
              >{#if n > highest}<span class="lock"><Icon name="lock" /></span>{/if}</button
            >
          </li>{/each}
      </ol>
    </div>
  {:else if route === "unfinished"}
    <div class="page">
      <ul class="unfinished">
        {#each bank.slots as slot (slot.attemptId)}<li>
            <button class="uf" onclick={() => onresume(slot.attemptId)}
              ><span class="uf-title"
                >Resume {date(slot.updatedAt)} · {("label" in slot && slot.label) ||
                  modeName(slot.mode, slot.level)}</span
              ><span class="uf-time">{formatTime(Math.floor(slot.effectiveMs / 1000))}</span><span
                class="well"><Icon name="play" /></span
              ></button
            >
          </li>{/each}
      </ul>
    </div>
  {:else if route === "list" && list}
    <div class="stick">
      <p class="status">
        {#if level > 3 && !list.totals.solved && !list.totals.inProgress}剛解鎖{:else}已解 <b
            >{list.totals.solved}</b
          >／{list.totals.total} · 進行中 <b>{list.totals.inProgress}</b>{/if}
      </p>
      <div class="chips" role="group" aria-label="篩選">
        {#each ["全部", "未解", "已解", "進行中"] as name (name)}<button
            class="chip"
            class:on={filter === name}
            aria-pressed={filter === name}
            onclick={() => (filter = name)}>{name}</button
          >{/each}
      </div>
    </div>
    <div class="page">
      <ol class="puzzles" bind:this={listEl}>
        {#each filtered as item (item.index)}<li
            class="lv pz"
            data-index={item.index}
            class:unsolved={item.state === "unsolved"}
            class:active={["in_progress", "replaying"].includes(item.state)}
          >
            <button
              aria-label={`第 ${item.index} 題，${status(item)}`}
              onclick={() => onpuzzle(item)}
              ><span class="n">{item.index}</span><span class="copy"
                ><span class="name">{status(item)}</span>{#if item.state === "replaying"}<span
                    class="range">最佳 {formatTime(Math.floor(item.bestMs / 1000))}</span
                  >{:else if item.solvedAt}<span class="range">{date(item.solvedAt)}</span
                  >{/if}</span
              ><span class="state-icon" class:solved={item.solvedAt !== null}
                ><Icon
                  name={item.solvedAt !== null
                    ? "circle-check"
                    : item.state === "in_progress"
                      ? "circle-play"
                      : "circle"}
                /></span
              ></button
            >
          </li>{/each}
      </ol>
      {#if !filtered.length && filter === "已解"}<p class="empty">
          <b>這一級還沒有解完的題</b>解完的題會出現在這裡，之後可以重玩。
        </p>{/if}
    </div>
    {#if list.nextIndex}<div class="dock">
        <button class="go" onclick={() => onpuzzle(list.items[list.nextIndex - 1])}
          ><Icon name="play" />Next: 第 {list.nextIndex} 題</button
        >
      </div>{/if}
  {/if}
</div>

<style>
  .bank-pages {
    width: 100%;
    flex: 1;
    height: 100%;
    overscroll-behavior: contain;
    overflow: auto;
    color: var(--ink);
    padding-top: 12px;
    background: var(--page);
    font-family: var(--ui-font);
  }
  button {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  button:disabled {
    cursor: wait;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 44px;
    padding: 0 16px;
    background: var(--page);
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }
  h1 span {
    font-weight: 500;
    color: var(--ink2);
    font-size: 17px;
    margin-left: 10px;
  }
  .back {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--neutral);
    display: grid;
    place-items: center;
    color: var(--ink2);
    flex: none;
    --ic: 18px;
  }
  .page {
    padding: 20px 16px 84px;
  }
  .home {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 12px;
  }
  .home-side {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .sheet {
    background: var(--card);
    border: 1px solid var(--hair);
    border-radius: 16px;
    overflow: hidden;
    width: 100%;
  }
  .pick {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 18px 20px;
    position: relative;
  }
  .pick + .pick:before,
  .way + .way:before {
    content: "";
    position: absolute;
    top: 0;
    left: 20px;
    right: 20px;
    border-top: 1px solid var(--hair);
  }
  .pick:hover,
  .way:hover,
  .custom-entry:hover {
    background: var(--page);
  }
  .pick:active,
  .way:active {
    background: var(--sel);
  }
  .pick b {
    font-size: 22px;
    letter-spacing: -0.03em;
    line-height: 1.15;
  }
  .pick span {
    font-size: 16px;
    line-height: 1.4;
    color: var(--ink2);
  }
  .way {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    text-align: left;
    padding: 16px 20px;
    position: relative;
    --ic: 18px;
  }
  .way b {
    font-size: 17px;
    font-weight: 600;
  }
  .tail {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: var(--ink2);
  }
  .custom-entry {
    border: 1px solid var(--hair);
    background: var(--card);
    width: 100%;
    min-height: 80px;
    text-align: left;
    border-radius: 14px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 12px;
    padding: 16px;
    --ic: 18px;
  }
  .symbol {
    background: var(--neutral-2);
    width: 36px;
    height: 36px;
    color: var(--ink2);
    border-radius: 9px;
    display: grid;
    place-items: center;
  }
  .copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .custom-entry b {
    font-size: 16px;
  }
  .custom-entry .copy span {
    color: var(--ink2);
    font-size: 12px;
    line-height: 1.45;
  }
  .status {
    margin: 0 0 16px;
    padding-left: 4px;
    font-size: 15px;
    line-height: 1.4;
    color: var(--ink2);
  }
  .status b {
    color: var(--ink);
    font-weight: 600;
  }
  ol,
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lv {
    border-top: 1px solid var(--hair);
  }
  .lv:last-child {
    border-bottom: 1px solid var(--hair);
  }
  .lv button {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 4px;
    padding: 14px 0;
    min-height: 68px;
  }
  .lv button:hover {
    background: var(--neutral-2);
  }
  .lv .n {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1;
    padding-left: 4px;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
  }
  .range {
    font-size: 14px;
    line-height: 1.3;
    color: var(--ink2);
    font-variant-numeric: tabular-nums;
  }
  .lock {
    --ic: 18px;
    color: var(--ink2);
    width: 18px;
    height: 18px;
    display: flex;
    flex: 0 0 18px;
  }
  .locked button {
    cursor: not-allowed;
  }
  .locked .n,
  .locked .name {
    color: var(--ink2);
  }
  .locked .name {
    font-weight: 500;
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }
  .cnt {
    font-size: 14px;
    font-weight: 600;
  }
  .pips {
    display: inline-flex;
    gap: 3px;
  }
  .pips i {
    width: 9px;
    height: 9px;
    border-radius: 2.5px;
    border: 1.25px solid var(--ink2);
  }
  .pips i.on {
    background: var(--ink);
    border-color: var(--ink);
  }
  .unfinished li {
    border-top: 1px solid var(--hair);
  }
  .unfinished li:last-child {
    border-bottom: 1px solid var(--hair);
  }
  .uf {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 30px;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 0 4px;
    text-align: left;
    border-radius: 8px;
  }
  .uf:hover {
    background: var(--neutral-2);
  }
  .uf-title {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .uf-time {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: var(--ink2);
  }
  .well {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    background: var(--sel);
    color: var(--blue-d);
    --ic: 11px;
  }
  .well :global(svg) {
    fill: currentColor;
    stroke: none;
  }
  .stick {
    position: sticky;
    top: 44px;
    z-index: 4;
    background: var(--page);
    padding: 12px 16px;
    border-bottom: 1px solid var(--hair);
  }
  .stick .status {
    margin-bottom: 10px;
  }
  .chips {
    display: flex;
    gap: 8px;
  }
  .chip {
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
    font: 600 13px/1 var(--ui-font);
  }
  .chip.on {
    background: var(--sel);
    box-shadow: inset 0 0 0 1.5px var(--blue);
    color: var(--blue-d);
  }
  .puzzle-list .page {
    padding-top: 0;
    padding-bottom: 120px;
  }
  /* Phone: the raised update pill sits above the dock; keep the last rows clear of it. */
  @media (max-width: 599px) {
    :global(:root:has(.update-notice.pill.active)) .puzzle-list .page {
      padding-bottom: 180px;
    }
  }
  .pz button {
    grid-template-columns: 64px minmax(0, 1fr) 30px;
    min-height: 64px;
    padding: 11px 0;
  }
  .pz .n {
    font-size: 26px;
  }
  .pz.unsolved .name {
    color: var(--ink2);
    font-weight: 500;
  }
  .pz.active .name {
    color: var(--blue-d);
  }
  .state-icon {
    --ic: 24px;
    justify-self: end;
    margin-right: 4px;
    color: var(--sv-sep);
  }
  .pz.active .state-icon:not(.solved) {
    color: var(--blue);
  }
  .state-icon.solved {
    color: var(--cue-ink);
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
  .empty {
    margin: 56px 4px 0;
    font-size: 17px;
    line-height: 1.5;
    color: var(--ink2);
  }
  .empty b {
    display: block;
    margin-bottom: 6px;
    font-size: 20px;
    color: var(--ink);
  }
  @media (min-width: 600px) {
    .bank-pages {
      width: 100%;
      flex: 1;
      padding-top: 0;
    }
    .bar {
      height: 64px;
      padding: 0 32px;
      border-bottom: 1px solid var(--hair);
    }
    h1 {
      font-size: 24px;
    }
    .page {
      padding: 48px 32px 84px;
    }
    .home {
      flex-direction: row;
      gap: 40px;
      align-items: flex-start;
    }
    .home-main {
      flex: 0 1 520px;
      max-width: 520px;
    }
    .home-side {
      flex: 0 1 400px;
      gap: 20px;
    }
    .pick {
      padding: 20px 24px;
    }
    .pick b {
      font-size: 24px;
    }
    .pick + .pick:before,
    .way + .way:before {
      left: 24px;
      right: 24px;
    }
    .way {
      padding: 18px 24px;
    }
    .levels {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      column-gap: 32px;
      row-gap: 40px;
    }
    .levels .lv {
      border-bottom: 0;
    }
    .levels .lv button {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
      padding: 20px 12px 20px 0;
      position: relative;
    }
    .levels .n {
      font-size: 38px;
      padding-left: 0;
    }
    .levels .name {
      font-size: 18px;
    }
    .levels .range {
      font-size: 15px;
    }
    .status {
      font-size: 16px;
      padding-left: 0;
      margin-bottom: 28px;
    }
    .unfinished {
      max-width: 640px;
    }
    .uf {
      min-height: 60px;
      padding: 0 8px;
    }
    .uf-title {
      font-size: 17px;
    }
    .stick {
      top: 64px;
      padding: 16px 32px;
    }
    .puzzles {
      max-width: 680px;
    }
    .pz button {
      column-gap: 0;
      grid-template-columns: 80px minmax(0, 1fr) 40px;
      padding: 14px 8px 14px 0;
      min-height: 72px;
    }
    .pz .n {
      font-size: 28px;
    }
    .dock {
      padding: 14px 32px;
    }
    .go {
      max-width: 360px;
    }
  }
</style>
