<script>
  import { onMount, onDestroy } from "svelte";
  import { done, timer, timerRunning } from "./store";

  let interval;

  onMount(() => {
    interval = setInterval(() => {
      if ($timerRunning && !$done) {
        timer.update((t) => t + 1);
      }
    }, 1000);
  });

  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
    }
  });

  $: minutes = Math.floor($timer / 60);
  $: seconds = $timer % 60;
</script>

<div class="timer timer2">
  <svg class="timer-icon ic" viewBox="0 0 24 24" aria-hidden="true">
    <line x1="10" x2="14" y1="2" y2="2"></line>
    <line x1="12" x2="15" y1="14" y2="11"></line>
    <circle cx="12" cy="14" r="8"></circle>
  </svg>
  <b class="time">{minutes}{seconds < 10 ? ":0" : ":"}{seconds}</b>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--timer-bg);
    border: 1px solid var(--timer-line);
    border-radius: 8px;
    padding: 4px 8px;
    color: var(--timer-ink);
    font-family: var(--ui-font);
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
</style>
