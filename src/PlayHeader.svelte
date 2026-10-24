<script>
  import { fade } from "svelte/transition";
  import { game } from "./game/game.svelte.js";
  import { playUi } from "./play/session.svelte.js";
  import { formatTime } from "./store.js";
  import { DIFF_LABEL, longDate, shortDate } from "./journal/format.js";
  import DiffLabel from "./journal/DiffLabel.svelte";
  import Icon from "./journal/Icon.svelte";
  import Timer from "./Timer.svelte";
  import NotesMode from "./NotesMode.svelte";

  /** @type {{journal: boolean, narrow: boolean, hasPlayed: boolean, frozenElapsed: number,
   * freshTarget: {date: string, diff: string, elapsed: number} | null,
   * ondate: () => void, ontime: () => void, onbrand: () => void}} */
  let { journal, narrow, hasPlayed, frozenElapsed, freshTarget, ondate, ontime, onbrand } =
    $props();
  const fresh = $derived(journal && !hasPlayed);
  const name = $derived(
    journal ? (fresh ? "Play" : "Back to game") : playUi.paused ? "Resume" : "Pause"
  );
  const showPlay = $derived(journal || playUi.paused);
  const difficulty = $derived(
    game.difficulty === "easy" || game.difficulty === "medium" || game.difficulty === "hard"
      ? game.difficulty
      : null
  );
  const date = $derived(game.dateStr ? shortDate(game.dateStr) : "");
  const dateName = $derived(
    game.dateStr
      ? `${longDate(game.dateStr)}, ${DIFF_LABEL[game.difficulty]}. Open Journal on this day`
      : "Custom puzzle. Open Journal"
  );
</script>

<header class="header" class:on-journal={journal} class:reduced={playUi.reduced}>
  <div class="left">
    {#if journal}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <h1 transition:fade={{ duration: playUi.reduced ? 0 : 160 }} onclick={onbrand}>Sudoku</h1>
    {:else}
      <button
        transition:fade={{ duration: playUi.reduced ? 0 : 160 }}
        class="dbtn"
        type="button"
        aria-label={dateName}
        onclick={ondate}
      >
        <span class="tile"><Icon name="calendar-days" /></span>
        <span class="stk">
          <span class="t1">
            {#if game.dateStr}
              <span class="full-date">{longDate(game.dateStr)}</span>
              <span class="short-date"
                ><span class="wk">{date.split(", ")[0] + ", "}</span>{date.split(", ")[1]}</span
              >
            {:else}Custom puzzle{/if}
          </span>
          {#if difficulty}
            <span class="t2"><DiffLabel diff={difficulty} size={12} /></span>
          {/if}
        </span>
      </button>
    {/if}
  </div>
  <div class="right">
    {#if !journal}
      {#if !narrow}
        <div class="auto-slot" transition:fade={{ duration: playUi.reduced ? 0 : 160 }}>
          <NotesMode desktop />
        </div>
      {/if}
      <button
        transition:fade={{ duration: playUi.reduced ? 0 : 160 }}
        class="more"
        type="button"
        data-more
        aria-label="More"
        title="More options"
        aria-haspopup="dialog"
        disabled={playUi.paused}
        onclick={() => playUi.openOptions()}
      >
        <Icon name="ellipsis" />
      </button>
    {/if}
    <button
      class="tp pc"
      id="time-control"
      type="button"
      class:is-paused={showPlay}
      aria-label={name}
      aria-pressed={journal ? undefined : playUi.paused}
      aria-describedby={fresh ? "header-time fresh-target" : "header-time"}
      title={`${name} (P)`}
      onclick={ontime}
    >
      <span class="face">
        <span class="ts" id="header-time">
          {#if journal}
            {fresh
              ? freshTarget
                ? formatTime(freshTarget.elapsed)
                : "Play"
              : formatTime(frozenElapsed)}
          {:else}<Timer />{/if}
        </span>
        <span class="well"
          ><span class="gm" class:is-play={showPlay} aria-hidden="true">
            <span class="g gp"
              ><svg viewBox="0 0 24 24"
                ><rect x="14" y="3" width="5" height="18" rx="1" /><rect
                  x="5"
                  y="3"
                  width="5"
                  height="18"
                  rx="1"
                /></svg
              ></span
            >
            <span class="g gy"
              ><svg viewBox="0 0 24 24"
                ><path
                  d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
                /></svg
              ></span
            >
          </span></span
        >
      </span>
    </button>
    {#if fresh}
      <span id="fresh-target" class="sr-only"
        >{freshTarget
          ? `Resumes ${longDate(freshTarget.date)}, ${DIFF_LABEL[freshTarget.diff]}`
          : "Starts the first unsolved puzzle on the latest day"}</span
      >
    {/if}
  </div>
</header>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex: none;
    height: 64px;
    padding: 0 32px;
    margin: 0 0 24px;
    border-bottom: 1px solid var(--hair);
    box-sizing: border-box;
    font-family: var(--ui-font);
  }
  .header.on-journal {
    margin-bottom: 0;
  }
  .left {
    flex: none;
    display: grid;
    align-items: center;
  }
  .left > * {
    grid-area: 1/1;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
    color: var(--ink);
    cursor: pointer;
  }
  .right {
    display: flex;
    align-items: center;
    flex: none;
  }
  button {
    appearance: none;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--ink);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .dbtn {
    display: flex;
    align-items: center;
    min-height: 44px;
    border-radius: 12px;
    white-space: nowrap;
    gap: 10px;
    padding: 0 12px 0 6px;
    margin-left: -6px;
    text-align: left;
    transition: background-color 160ms var(--ease-out);
  }
  .tile {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: var(--neutral);
    color: var(--ink2);
    flex: none;
    --ic: 17px;
  }
  .stk {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .t1 {
    font-size: 20px;
    line-height: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .t2 {
    font-size: 13px;
    line-height: 14px;
    font-weight: 500;
    color: var(--ink2);
  }
  .t2 :global(.diff) {
    gap: 6px;
    font-weight: 500;
  }
  .short-date {
    display: none;
  }
  .dbtn:active {
    background: var(--neutral);
  }
  .dbtn:active .tile {
    background: var(--card);
  }
  .dbtn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -4px;
    border-radius: 10px;
  }
  .auto-slot {
    display: flex;
    align-items: center;
    min-height: 44px;
    margin: 0 2px;
  }
  .more {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    color: var(--ink2);
    margin-right: 6px;
    border-radius: 8px;
    --ic: 18px;
  }
  .more:active {
    background: var(--neutral);
  }
  .more:disabled {
    opacity: 1;
    cursor: default;
  }
  .tp {
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: none;
    border-radius: 12px;
    margin-left: 4px;
  }
  .tp:focus {
    outline: none;
  }
  .face {
    display: flex;
    align-items: center;
    line-height: 1;
    white-space: nowrap;
    box-sizing: border-box;
    height: 36px;
    padding: 0 3px 0 12px;
    border-radius: 10px;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
    font-size: 16px;
    font-weight: 600;
    transition:
      background-color 160ms var(--ease-out),
      color 160ms var(--ease-out),
      box-shadow 160ms var(--ease-out);
  }
  .tp:focus-visible .face,
  .tp:global(.modality-focus-ring):focus .face {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  :global(:root[data-modality="pointer"]) .tp:focus-visible .face {
    outline: none;
  }
  .ts {
    display: inline-grid;
    font-variant-numeric: tabular-nums;
    justify-items: end;
  }
  .well {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-left: 10px;
    border-radius: 7px;
    transition: background-color 160ms var(--ease-out);
  }
  .gm {
    position: relative;
    display: inline-block;
    width: 11px;
    height: 11px;
    flex: none;
    color: var(--ink2);
  }
  .g {
    position: absolute;
    inset: 0;
    transition:
      opacity 160ms var(--ease-out),
      transform 160ms var(--ease-out);
  }
  .g svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: currentColor;
    stroke: none;
  }
  .gy {
    opacity: 0;
    transform: scale(0.6) rotate(-30deg);
  }
  .is-play .gp {
    opacity: 0;
    transform: scale(0.6) rotate(30deg);
  }
  .is-play .gy {
    opacity: 1;
    transform: none;
  }
  .gy svg {
    transform: translateX(1px);
  }
  .is-paused .well {
    background: var(--sel);
  }
  .is-paused .gm {
    color: var(--blue-d);
  }
  .tp:active .face {
    background: var(--neutral-2);
  }
  .tp:active .well {
    background: var(--neutral);
  }
  .tp.is-paused:active .well {
    background: var(--sel-press);
  }
  @media (hover: hover) and (min-width: 600px) {
    .dbtn:hover {
      background: var(--neutral-2);
    }
    .dbtn:active {
      background: var(--neutral);
    }
    .tp:hover .face {
      box-shadow: inset 0 0 0 1px rgb(28 26 22 / 0.22);
    }
    .tp:hover .well {
      background: var(--neutral);
    }
    .tp.is-paused:hover .well {
      background: var(--sel-press);
    }
  }
  @media (max-width: 719px) {
    .full-date {
      display: none;
    }
    .short-date {
      display: inline;
    }
  }
  @media (max-width: 599px) {
    .header {
      height: 44px;
      padding: 0 clamp(8px, calc(8px + (100vw - 320px) * 8 / 69), 16px);
      margin: -3px -8px -7px;
      border: 0;
    }
    .header.on-journal {
      margin-bottom: -7px;
    }
    h1 {
      font-size: 22px;
    }
    .t1 {
      font-size: 17px;
      line-height: 20px;
    }
    .tile {
      width: 32px;
      height: 32px;
    }
    .tp {
      margin: 0;
    }
    .more,
    .auto-slot {
      display: none;
    }
  }
  @media (max-width: 359px) {
    .wk {
      display: none;
    }
  }
  .reduced .g {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .g {
      transition: none;
    }
  }
</style>
