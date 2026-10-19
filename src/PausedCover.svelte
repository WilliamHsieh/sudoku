<script>
  import { onMount } from "svelte";
  import { timer } from "./store.js";

  /** @type {{ showKey?: boolean, onresume: () => void }} */
  let { showKey = false, onresume } = $props();

  onMount(() => {
    document.getElementById("resume")?.focus({ preventScroll: true });
  });

  const label = $derived.by(() => {
    const minutes = Math.floor($timer / 60);
    const seconds = $timer % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  });
</script>

<div class="paused-cover">
  <p class="paused-kicker">Paused</p>
  <p class="paused-time" data-time>{label}</p>
  <p class="paused-line">The board is hidden and the clock is stopped.</p>
  <button type="button" class="btn btn-primary" id="resume" onclick={onresume}>
    <svg class="ic play-ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
      ></path>
    </svg>
    Resume
  </button>
  {#if showKey}
    <p class="paused-kbd">or press <kbd>P</kbd></p>
  {/if}
</div>

<style>
  .paused-cover {
    position: absolute;
    inset: 0;
    z-index: 20;
    border-radius: var(--board-radius);
    background: var(--paused-cover);
    box-shadow: inset 0 0 0 1px var(--hair);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    padding: 24px;
  }

  .paused-kicker {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ui-soft);
    margin: 0;
  }

  .paused-time {
    font-size: 56px;
    font-weight: 600;
    line-height: 1.1;
    color: var(--ui-ink);
    font-variant-numeric: tabular-nums;
    margin: 0;
  }

  .paused-line {
    font-size: 14px;
    color: var(--ui-soft);
    margin: 0 0 16px;
    max-width: 26ch;
    line-height: 1.4;
  }

  .paused-kbd {
    font-size: 13px;
    color: var(--ui-soft);
    margin: 10px 0 0;
  }

  kbd {
    display: inline-block;
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--board-bg);
    box-shadow:
      inset 0 0 0 1px var(--hair),
      0 1px 0 var(--hair);
    font:
      600 12px/18px var(--ui-font),
      sans-serif;
    color: var(--ui-ink);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 44px;
    padding: 0 22px;
    border-radius: 10px;
    border: 0;
    font-family: var(--ui-font);
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    background: var(--primary);
    color: var(--on-accent);
  }

  .btn svg {
    width: 18px;
    height: 18px;
    flex: none;
  }

  .play-ic path {
    fill: currentColor;
    stroke: none;
  }

  .btn:focus {
    outline: none;
  }

  .btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (hover: hover) {
    .btn:hover {
      background: var(--primary-hover);
    }
  }

  @media (min-width: 600px) {
    .paused-time {
      font-size: 72px;
    }
    .paused-line {
      font-size: 15px;
    }
  }
</style>
