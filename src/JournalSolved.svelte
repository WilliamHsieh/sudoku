<script>
  import { onMount } from "svelte";
  import { game } from "./game/game.svelte.js";
  import { solvedPuzzles, puzzleProgress, formatTime } from "./store.js";
  import { solvedModel } from "./solved.js";
  import { puzzleData } from "./puzzles.js";
  import { replayProgress } from "./journal/progress.js";
  import { replayState } from "./journal/stats.js";
  import { DIFF_LABEL } from "./journal/format.js";
  import Icon from "./journal/Icon.svelte";
  /** @type {{onjournal: () => void, onreplay: () => void, onresume: () => void}} */
  let { onjournal, onreplay, onresume } = $props();
  const replay = $derived(
    replayState($solvedPuzzles, $replayProgress, game.dateStr, game.difficulty)
  );
  const record = $derived($solvedPuzzles[game.dateStr]?.[game.difficulty]);
  const model = $derived(
    solvedModel({
      date: game.dateStr,
      difficulty: game.difficulty,
      time: record.time,
      solved: $solvedPuzzles,
      progress: $puzzleProgress,
      puzzles: puzzleData,
    })
  );
  const comparison = $derived(
    model.delta == null
      ? ""
      : model.delta > 0
        ? ` · +${formatTime(model.delta)} slower than average`
        : ` · ${formatTime(Math.abs(model.delta))} faster than average`
  );
  const stamp = $derived(new Date(record.timestamp));
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
      <p class="hero" aria-label={`Time ${formatTime(record.time)}`}>{formatTime(record.time)}</p>
      <span class="summary"
        >{DIFF_LABEL[game.difficulty]}<span class:slower={model.delta != null && model.delta > 0}
          >{comparison}</span
        ></span
      >
    </div>
    {#if replay}
      <div class="replay-card" role="group" aria-labelledby="sv-replay-title">
        <div class="replay-text">
          <b id="sv-replay-title">Replay in progress</b>
          <span>{formatTime(replay.elapsed)} played · {replay.pct}% filled</span>
          <div class="replay-bar" aria-hidden="true"><i style:width={`${replay.pct}%`}></i></div>
        </div>
        <button
          class="resume"
          aria-label={`Resume replay, ${formatTime(replay.elapsed)} played`}
          onclick={onresume}><Icon name="play" />Resume</button
        >
      </div>
    {/if}
    <div class="actions">
      <button class="quiet journal-back" onclick={onjournal}
        ><Icon name="arrow-left" />Journal</button
      >
      <button
        class={replay ? "quiet replay" : "primary replay"}
        id="sv-replay"
        aria-haspopup="dialog"
        aria-describedby="sv-rn"
        onclick={onreplay}><Icon name="rotate-ccw" />Replay</button
      >
    </div>
    <p id="sv-rn" class="note">
      <Icon name="history" /><span
        >Your <b>{formatTime(record.time)}</b> stays saved until you finish {replay ? "the" : "a"} replay.</span
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
  .slower {
    color: var(--ui-ink);
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
  .replay-card {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
    padding: 12px 12px 12px 14px;
    border-radius: 12px;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .replay-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .replay-text b {
    font: 600 15px/1.3 var(--ui-font);
    color: var(--ui-ink);
  }
  .replay-text span {
    font: 500 13px/1.3 var(--ui-font);
    color: var(--ink2);
  }
  .replay-bar {
    height: 4px;
    border-radius: 2px;
    background: var(--neutral);
    margin-top: 6px;
    max-width: 150px;
    overflow: hidden;
  }
  .replay-bar i {
    display: block;
    height: 100%;
    background: var(--amber);
  }
  button.resume {
    flex: none;
    height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font: 600 15px/1 var(--ui-font);
    gap: 7px;
    --ic: 16px;
    background: var(--blue);
    color: var(--on-accent);
  }
  button.resume:hover {
    background: var(--blue-d);
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
  button.resume:disabled,
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
    .replay-card {
      flex-direction: column;
      align-items: stretch;
      text-align: left;
      margin-top: 20px;
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
