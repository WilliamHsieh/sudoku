<script>
  import { onMount } from "svelte";
  import { game } from "./game/game.svelte.js";
  import { solvedPuzzles, puzzleProgress, formatTime } from "./store.js";
  import { solvedModel } from "./solved.js";
  import { puzzleData } from "./puzzles.js";
  import { DIFF_LABEL } from "./journal/format.js";
  import Icon from "./journal/Icon.svelte";
  /** @type {{onjournal: () => void, onreplay: () => void}} */
  let { onjournal, onreplay } = $props();
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
    <div class="actions">
      <button class="quiet" onclick={onjournal}><Icon name="arrow-left" />Journal</button>
      <button class="primary" id="sv-replay" aria-describedby="sv-rn" onclick={onreplay}
        ><Icon name="rotate-ccw" />Replay</button
      >
    </div>
    <p id="sv-rn" class="note">
      <Icon name="history" /><span
        >Your <b>{formatTime(record.time)}</b> stays saved until you finish a replay.</span
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
    --ic: 17px;
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
    .result-row {
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .hero {
      font-size: 56px;
    }
    .actions {
      flex-direction: column;
    }
    button {
      flex: auto;
    }
  }
</style>
