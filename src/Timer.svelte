<script>
  import { onMount } from "svelte";
  import { timer, attachElapsedTimer, formatTime } from "./store";

  // Mounted only in Play. Journal reads its entry snapshot without attaching.
  onMount(() => {
    if (new URLSearchParams(window.location.search).has("freeze")) return;
    return attachElapsedTimer();
  });
</script>

<span class="time" data-time>{formatTime($timer)}</span>
