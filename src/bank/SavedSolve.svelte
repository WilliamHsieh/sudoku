<script>
  import { onMount } from "svelte";
  import Icon from "../journal/Icon.svelte";
  import { formatTime } from "../store.js";
  /** @type {{attempt: Pick<import('./types.js').Attempt, 'endedAt'|'effectiveMs'>, name: string, listName: string, delta: number | null, replay: {effectiveMs:number,attemptId:string} | null, onback: () => void, onreplay: () => void, onresume: () => void}} */
  let { attempt, name, listName, delta, replay, onback, onreplay, onresume } = $props();
  const stamp = $derived(new Date(attempt.endedAt));
  const date = $derived(stamp.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const time = $derived(
    stamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
  onMount(() => document.getElementById("sv-h")?.focus({ preventScroll: true }));
</script>

<section class="sv-view-panel" aria-labelledby="sv-h">
  <div class="group">
    <h2 id="sv-h" tabindex="-1">
      <Icon name="circle-check" /><span>Solved {date} at {time}</span>
    </h2>
    <div class="result-row">
      <p class="hero" aria-label={`Time ${formatTime(Math.floor(attempt.effectiveMs / 1000))}`}>
        {formatTime(Math.floor(attempt.effectiveMs / 1000))}
      </p>
      <span class="summary"
        >{name}{#if delta !== null}
          · {formatTime(Math.abs(delta))} {delta > 0 ? "slower" : "faster"} than average{/if}</span
      >
    </div>
    <div class="actions">
      <button class="quiet level-back" onclick={onback}><Icon name="arrow-left" />{listName}</button
      ><button
        class="primary replay"
        id="sv-replay"
        aria-haspopup={replay ? undefined : "dialog"}
        aria-describedby="sv-rn"
        onclick={replay ? onresume : onreplay}
        ><Icon name="rotate-ccw" />{replay ? "Resume replay" : "Replay"}</button
      >
    </div>
    <p id="sv-rn" class="note">
      <Icon name="history" /><span
        >Your <b>{formatTime(Math.floor(attempt.effectiveMs / 1000))}</b> stays saved until you
        finish {replay ? "the" : "a"} replay.</span
      >
    </p>
  </div>
</section>

<style>
  .sv-view-panel {
    padding: 16px 6px 0;
    color: var(--ui-ink);
    width: 100%;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font: 600 15px/1.3 var(--ui-font);
    color: var(--ui-soft);
    outline: none;
    --ic: 18px;
  }
  h2 :global(svg) {
    color: var(--cue-ink);
  }
  .result-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-top: 6px;
  }
  .hero {
    margin: 0;
    font: 700 48px/1 var(--ui-font);
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  .summary {
    font: 500 15px/1.3 var(--ui-font);
    color: var(--ui-soft);
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 22px;
  }
  button {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 12px;
    height: 48px;
    font: 600 16px/1 var(--ui-font);
    cursor: pointer;
    --ic: 18px;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .quiet {
    background: var(--neutral);
    color: var(--ui-ink);
  }
  .quiet:hover {
    background: var(--sv-quiet-hover);
  }
  .primary {
    background: var(--blue);
    color: var(--on-accent);
  }
  .primary:hover {
    background: var(--blue-d);
  }
  button:disabled,
  button:disabled:hover {
    background: var(--neutral);
    color: var(--ui-soft);
    opacity: 0.65;
    cursor: default;
  }
  .note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 12px 2px 0;
    font: 500 14px/1.4 var(--ui-font);
    color: var(--ui-soft);
    --ic: 16px;
  }
  .note :global(svg) {
    margin-top: 2px;
  }
  b {
    color: var(--ui-ink);
    font-weight: 600;
  }
  @media (min-width: 600px) {
    .sv-view-panel {
      position: absolute;
      top: 0;
      left: clamp(0px, (50vw - 177px - 236px) / 2 - 32px, 56px);
      width: 236px;
      height: var(--sv-board-size, 650px);
      padding: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .group {
      text-align: center;
    }
    h2 {
      justify-content: center;
      font-size: 14px;
      --ic: 17px;
    }
    .result-row {
      flex-direction: column;
      gap: 8px;
      align-items: center;
      margin-top: 10px;
    }
    .hero {
      font-size: 100px;
      line-height: 0.92;
      letter-spacing: -0.035em;
    }
    .actions {
      flex-direction: column;
      gap: 8px;
      margin-top: 24px;
    }
    .actions button {
      flex: none;
      height: 48px;
      border-radius: 9px;
      font: 600 15px/1 var(--ui-font);
      --ic: 16px;
    }
    .actions .replay {
      order: -1;
    }
    .actions .primary {
      height: 56px;
      border-radius: 11px;
      font-size: 16px;
      --ic: 18px;
    }
    .note {
      margin: 14px 0 0;
      text-align: left;
    }
  }
</style>
