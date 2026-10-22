<script>
  import { onMount } from "svelte";
  import { timer } from "./store.js";

  /** @type {{ showKey?: boolean, away?: boolean, revealing?: boolean, leaving?: boolean, onresume: () => void, onleft?: () => void, onopaque?: () => void }} */
  let {
    showKey = false,
    away = false,
    revealing = false,
    leaving = false,
    onresume,
    onleft,
    onopaque,
  } = $props();

  /** @param {AnimationEvent} e */
  function onAnimEnd(e) {
    if (e.target !== e.currentTarget) return;
    if (e.animationName.includes("cover-in")) {
      if (!leaving && !revealing) onopaque?.();
      return;
    }
    if (!leaving || !e.animationName.includes("cover-out")) return;
    onleft?.();
  }

  onMount(() => {
    document.getElementById("resume")?.focus({ preventScroll: true });
  });

  const label = $derived.by(() => {
    const minutes = Math.floor($timer / 60);
    const seconds = $timer % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  });
</script>

<div class={leaving ? "paused-leave" : "paused-cover"} class:revealing onanimationend={onAnimEnd}>
  <p class="paused-kicker">Paused</p>
  <p class="paused-time" data-time>{label}</p>
  <p class="paused-line">
    {#if away}
      Paused while you were away. It picks up when you come back.
    {:else}
      The board is hidden and the clock is stopped.
    {/if}
  </p>
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
  .paused-cover.revealing {
    pointer-events: none;
    animation: rv-cover var(--resume-ms, 320ms) var(--resume-ease, cubic-bezier(0.22, 1, 0.36, 1))
      both;
  }

  @keyframes rv-cover {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  .paused-cover,
  .paused-leave {
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

  .paused-cover {
    animation: cover-in var(--motion) var(--ease-out);
  }

  @keyframes cover-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .paused-leave {
    pointer-events: none;
    animation: cover-out var(--motion) var(--ease-out) forwards;
  }

  @keyframes cover-out {
    from {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0;
      transform: translateY(8px);
    }
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

  /* .board-slot is the size container. Below the 390×844 square (374px) the
     time and the gaps shrink with the board; at 374px and above they stay
     the phone sizes, so that screen does not move. */
  @container (max-height: 373px) {
    .paused-cover,
    .paused-leave {
      gap: calc(100cqh * 6 / 374);
      padding: calc(100cqh * 24 / 374);
    }

    .paused-time {
      font-size: calc(100cqh * 56 / 374);
    }

    .paused-line {
      margin-bottom: calc(100cqh * 16 / 374);
    }

    .paused-kbd {
      margin-top: calc(100cqh * 10 / 374);
    }
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
    flex: none;
    gap: 8px;
    height: 44px;
    min-height: 44px;
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

    /* Below the 1280×800 square (650px), same idea: 72px time and the
       desktop gaps only while the board is that tall. */
    @container (max-height: 649px) {
      .paused-cover,
      .paused-leave {
        gap: calc(100cqh * 6 / 650);
        padding: calc(100cqh * 24 / 650);
      }

      .paused-time {
        font-size: calc(100cqh * 72 / 650);
      }

      .paused-line {
        margin-bottom: calc(100cqh * 16 / 650);
      }

      .paused-kbd {
        margin-top: calc(100cqh * 10 / 650);
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .paused-cover,
    .paused-leave {
      animation: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .paused-cover.revealing {
      animation: none;
      opacity: 0;
    }
  }
</style>
