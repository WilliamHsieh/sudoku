<script>
  import { onMount } from "svelte";
  import { done, timer, timerRunning } from "./store";

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const elapsed = params.get("elapsed");
    if (elapsed && /^\d+$/.test(elapsed)) timer.set(Number(elapsed));
    const frozen = params.has("freeze");
    const interval = setInterval(() => {
      if (frozen || !$timerRunning || $done) return;
      timer.update((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  });

  const minutes = $derived(Math.floor($timer / 60));
  const seconds = $derived($timer % 60);
  const label = $derived(`${minutes}:${seconds < 10 ? "0" : ""}${seconds}`);
</script>

<div class="timer timer2" role="timer" aria-label="Elapsed time">
  <svg class="timer-icon ic" viewBox="0 0 24 24" aria-hidden="true">
    <line x1="10" x2="14" y1="2" y2="2"></line>
    <line x1="12" x2="15" y1="14" y2="11"></line>
    <circle cx="12" cy="14" r="8"></circle>
  </svg>
  <b class="time" data-time>{label}</b>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--timer-bg);
    border: 1px solid var(--timer-line);
    border-radius: 8px;
    padding: 6px 10px;
    color: var(--timer-ink);
    font-family: var(--ui-font);
    box-sizing: border-box;
  }

  .timer-icon {
    width: 15px;
    height: 15px;
    flex: none;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .time {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--timer-ink);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    min-width: 2.6em;
  }

  @media (min-width: 600px) {
    /* 30px lines up with Pause and More. Padding stays 6px 10px; the label stays centered. */
    .timer {
      height: 30px;
    }
  }

  @media (max-width: 599px) {
    /* H2 .timer2 — exact rules from h2-play.html */
    .timer2 {
      height: 30px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      border: 1px solid rgb(0 0 0 / 0.08);
      border-radius: 8px;
      background: rgb(255 255 255 / 0.7);
      color: #1c1a16;
    }
    .timer2 .ic {
      width: 15px;
      height: 15px;
    }
    .timer2 b {
      font-size: 14.4px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      min-width: 0;
    }
  }

  /* Reserve "999:59" below 390. 6ch is six tabular zeros; the colon is narrower,
     so the slot does not grow as the clock ticks and 390/desktop stay on content width. */
  @media (max-width: 389px) {
    .timer2 b {
      min-width: 6ch;
    }
  }
</style>
