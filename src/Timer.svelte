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

<div class="timer">
  <svg class="timer-icon" viewBox="0 0 24 24" aria-hidden="true">
    <line x1="10" x2="14" y1="2" y2="2"></line>
    <line x1="12" x2="15" y1="14" y2="11"></line>
    <circle cx="12" cy="14" r="8"></circle>
  </svg>
  <span class="time">{minutes}{seconds < 10 ? ":0" : ":"}{seconds}</span>
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
</style>
