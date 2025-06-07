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
  <span class="timer-icon">⏱️</span>
  <span class="time">{minutes}{seconds < 10 ? ":0" : ":"}{seconds}</span>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
  }

  .timer-icon {
    font-size: 1rem;
    opacity: 0.8;
  }

  .time {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  @media (max-width: 640px) {
    .timer {
      padding: 4px 8px;
    }

    .time {
      font-size: 0.9rem;
    }

    .timer-icon {
      font-size: 0.9rem;
    }
  }
</style>
