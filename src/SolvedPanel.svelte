<script>
  import { onMount } from "svelte";
  import Icon from "./journal/Icon.svelte";
  import Marks from "./journal/Marks.svelte";
  import DiffLabel from "./journal/DiffLabel.svelte";
  import { formatTime } from "./store.js";
  import { spokenTime } from "./solved.js";
  /** @type {{model: ReturnType<typeof import('./solved.js').solvedModel>, reduced: boolean, onnext: () => void, onjournal: () => void}} */
  let { model, reduced, onnext, onjournal } = $props();
  let heading = $state(/** @type {HTMLHeadingElement | undefined} */ (undefined));
  let announcement = $state("");
  let scoreRow = $state(/** @type {HTMLDListElement | undefined} */ (undefined));
  let wideFacts = $state(false);
  const RESUME_PREFIX = "Resume ";
  let nextLabel = $state(/** @type {HTMLSpanElement | undefined} */ (undefined));
  // Measure the full label at 16px, then step to 14px before truncation.
  $effect(() => {
    model.label;
    if (!nextLabel) return;
    const label = nextLabel;
    let stopped = false;
    function fitLabel() {
      if (stopped) return;
      label.style.fontSize = "";
      const detail = label.querySelector(".resume-detail") ?? label;
      if (detail.scrollWidth > detail.clientWidth) label.style.fontSize = "14px";
    }
    const frame = requestAnimationFrame(fitLabel);
    const observer = new ResizeObserver(fitLabel);
    if (label.parentElement) observer.observe(label.parentElement);
    document.fonts.ready.then(fitLabel);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });
  onMount(() => {
    // Preserve the system font and 14px labels. Some desktop fallbacks need
    // tighter tracking as their intrinsic content alone nearly fills 236px.
    const canvas = document.createElement("canvas").getContext("2d");
    function fitFacts() {
      if (!scoreRow || !canvas) return;
      const facts = [...scoreRow.children];
      const needed =
        facts.reduce((sum, fact) => {
          const label = fact.querySelector("dt");
          const value = fact.querySelector("dd");
          if (!label || !value) return sum;
          canvas.font = getComputedStyle(label).font;
          return (
            sum +
            Math.max(
              canvas.measureText(label.textContent ?? "").width,
              value.getBoundingClientRect().width
            )
          );
        }, 0) +
        Math.max(0, facts.length - 1) * 9;
      wideFacts = needed > scoreRow.clientWidth;
    }
    const observer = new ResizeObserver(fitFacts);
    if (scoreRow) observer.observe(scoreRow);
    document.fonts.ready.then(fitFacts);

    const focus = setTimeout(() => heading?.focus({ preventScroll: true }), reduced ? 200 : 700);
    const live = setTimeout(() => (announcement = model.announcement), 700);
    return () => {
      observer.disconnect();
      clearTimeout(focus);
      clearTimeout(live);
    };
  });
</script>

<section class="sv-panel" class:reduced aria-labelledby="sv-h">
  <div class="sv-group">
    <h2 id="sv-h" tabindex="-1" bind:this={heading}>
      <Icon name="circle-check" /> Solved
      {#if model.difficulty === "easy" || model.difficulty === "medium" || model.difficulty === "hard"}
        <span class="separator" aria-hidden="true">·</span><span class="difficulty"
          ><DiffLabel diff={model.difficulty} size={14} /></span
        >
      {/if}
    </h2>
    {#if model.newBest}<div class="sv-best">New best</div>{/if}
    <div class="sv-time" aria-label={`Time ${formatTime(model.time)}`}>
      {formatTime(model.time)}
    </div>
    {#if model.dated}
      <dl bind:this={scoreRow} class:wide-facts={wideFacts}>
        {#if model.delta != null}
          <div>
            <dt>vs average</dt>
            <dd
              class:faster={model.delta <= 0}
              aria-label={`${spokenTime(model.delta)} ${model.delta > 0 ? "slower" : "faster"} than average`}
            >
              {model.delta > 0 ? "+" : "−"}{formatTime(Math.abs(model.delta))}
            </dd>
          </div>
        {/if}
        {#if model.streak > 0}
          <div>
            <dt>day streak</dt>
            <dd aria-label={`${model.streak} day streak`}>
              <span class="flame"><Icon name="flame" /></span>{model.streak}
            </dd>
          </div>
        {/if}
        <div>
          <dt>{model.dayLabel}</dt>
          <dd aria-label={`${model.count} of 3 solved ${model.dayLabel}`}>
            <Marks kinds={model.kinds} size={11} gap={3} />{model.count}/3
          </dd>
        </div>
      </dl>
    {/if}
    <div class="sv-actions">
      <button
        class="sv-next"
        class:long={model.label.length > 14}
        aria-label={model.label}
        onclick={onnext}
        ><Icon name={model.target ? (model.resume ? "history" : "play") : "calendar-days"} /><span
          bind:this={nextLabel}
          class:resume-label={model.resume}
          >{#if model.resume}<span class="resume-prefix">{RESUME_PREFIX}</span><span
              class="resume-detail"
              title={model.resumeDetail}>{model.resumeDetail}</span
            >{:else}{model.label}{/if}</span
        >{#if model.label.length <= 14}<kbd aria-hidden="true">Enter</kbd>{/if}</button
      >
      {#if model.target}<button class="sv-journal" onclick={onjournal}
          ><Icon name="calendar-days" />Journal</button
        >{/if}
    </div>
  </div>
</section>
<p class="sv-live" aria-live="polite">{announcement}</p>

<style>
  .sv-panel {
    width: 100%;
    padding: 14px 6px 0;
    text-align: center;
    animation: sv-panel 420ms var(--ease-out) 600ms both;
  }
  h2 {
    margin: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 7px;
    font: 600 15px/1.3 var(--ui-font);
    color: var(--cue-ink);
    --ic: 18px;
    outline: none;
  }
  .separator {
    color: var(--sv-sep);
  }
  .difficulty {
    --diff-bar-on: var(--sv-bar-on);
    --diff-bar-off: var(--sv-bar-off);
    color: var(--ui-soft);
    font-weight: 500;
  }
  .difficulty :global(.diff) {
    font-weight: 500;
    gap: 7px;
  }
  .sv-best {
    margin-top: 6px;
    font: 600 15px/1.3 var(--ui-font);
    color: var(--cue-ink);
  }
  .sv-time {
    margin-top: 6px;
    font: 700 72px/1 var(--ui-font);
    letter-spacing: -0.03em;
    color: var(--ui-ink);
    font-variant-numeric: tabular-nums;
  }
  dl {
    display: flex;
    margin: 18px 0 0;
    padding: 14px 0;
    border-block: 1px solid var(--hair);
  }
  dl > div {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
  }
  dl > div + div {
    border-left: 1px solid transparent;
    position: relative;
  }
  dl > div + div::before {
    content: "";
    position: absolute;
    left: -1px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--hair);
  }
  dt {
    order: 2;
    font: 500 13px/1.3 var(--ui-font);
    color: var(--ui-soft);
    white-space: nowrap;
  }
  dd {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 24px;
    font: 700 20px/1 var(--ui-font);
    font-variant-numeric: tabular-nums;
    --ic: 17px;
  }
  .faster {
    color: var(--cue-ink);
  }
  .flame {
    display: flex;
    color: var(--sv-flame);
  }
  .sv-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 20px;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    border: 0;
    border-radius: 12px;
    font: 600 16px/1 var(--ui-font);
    cursor: pointer;
    --ic: 17px;
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .sv-next {
    height: 48px;
    background: var(--blue);
    color: var(--on-accent);
    padding: 0 8px;
  }
  .sv-next > span {
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sv-next > :global(svg),
  .resume-prefix {
    flex-shrink: 0;
  }
  .sv-next > .resume-label {
    display: flex;
    text-overflow: clip;
  }
  .resume-prefix {
    white-space: pre;
  }
  .resume-detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sv-next:hover {
    background: var(--blue-d);
  }
  .sv-journal {
    height: 44px;
    background: transparent;
    color: var(--blue);
  }
  .sv-journal:hover {
    background: var(--neutral-2);
  }
  kbd {
    display: none;
  }
  .sv-live {
    position: fixed;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @keyframes sv-panel {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes sv-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .reduced {
    animation: sv-fade 160ms linear 120ms both;
  }
  @media (min-width: 600px) {
    .sv-panel {
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
    h2 {
      font-size: 14px;
      --ic: 17px;
    }
    .sv-best {
      font-size: 14px;
      margin-top: 10px;
    }
    .sv-time {
      font-size: 100px;
      line-height: 0.92;
      letter-spacing: -0.035em;
      margin-top: 10px;
    }
    dl {
      margin-top: 22px;
      padding: 15px 0;
    }
    dl > div {
      padding: 0 3px;
      gap: 5px;
    }
    dl > div:nth-child(3)::before {
      left: -2.05px;
    }
    dl > div:nth-child(3) dd {
      translate: 1.05px 0;
    }
    dl.wide-facts {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(max-content, 1fr);
      column-gap: 9px;
    }
    dl.wide-facts > div {
      padding: 0;
      border: 0;
    }
    dl.wide-facts > div + div::before {
      left: -5px;
    }
    dl.wide-facts dt {
      letter-spacing: -0.9px;
    }
    dl.wide-facts > div:nth-child(3) dd {
      translate: none;
    }
    dt {
      font-size: 14px;
    }
    dd {
      font-size: 21px;
      height: 25px;
      --ic: 18px;
    }
    .sv-actions {
      margin-top: 24px;
      gap: 7px;
    }
    .sv-next {
      height: 56px;
      border-radius: 11px;
      --ic: 18px;
    }
    .sv-next.long {
      gap: 6px;
      padding-inline: 6px;
    }
    .sv-journal {
      height: 46px;
      border-radius: 9px;
      font-size: 15px;
      --ic: 16px;
    }
    kbd {
      display: inline;
      font: 600 12px/1 var(--ui-font);
      border: 1px solid var(--sv-kbd-line);
      background: var(--sv-kbd-bg);
      border-radius: 5px;
      padding: 3px 5px;
    }
  }
</style>
