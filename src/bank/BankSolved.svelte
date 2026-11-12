<script>
  import { onMount } from "svelte";
  import Icon from "../journal/Icon.svelte";
  import DiffLabel from "../journal/DiffLabel.svelte";
  import { formatTime } from "../store.js";
  import { spokenTime } from "../solved.js";
  /** @type {{model: ReturnType<typeof import('./solved-model.js').bankSolvedModel> | ReturnType<typeof import('./solved-model.js').customSolvedModel>, reduced: boolean, onnext: () => void, onfeedback: (feedback: import('./types.js').Feedback | undefined) => Promise<boolean>, resumeLabel?: string, onresume: () => void}} */
  let { model, reduced, onnext, onfeedback, resumeLabel = "", onresume } = $props();
  let feedback = $state(/** @type {import('./types.js').Feedback | undefined} */ (undefined));
  let feedbackPending = $state(false);
  const feelings = /** @type {[import('./types.js').Feedback,string][]} */ ([
    ["light", "輕鬆"],
    ["some_effort", "花了一點力氣"],
    ["struggle", "很吃力"],
  ]);
  onMount(() => {
    const id = setTimeout(
      () => {
        if (!document.querySelector(".unlock-overlay"))
          document.getElementById("sv-h")?.focus({ preventScroll: true });
      },
      reduced ? 200 : 700
    );
    return () => clearTimeout(id);
  });
</script>

<section class="sv-panel" class:reduced aria-labelledby="sv-h">
  <div class="sv-group">
    <h2 id="sv-h" tabindex="-1">
      <Icon name="circle-check" /> Solved{#if model.title}<span class="separator" aria-hidden="true"
          >·</span
        ><span class="difficulty"
          >{#if ["Easy", "Medium", "Hard"].includes(model.title)}<DiffLabel
              diff={model.title.toLowerCase()}
              size={14}
            />{:else}{model.title}{/if}</span
        >{/if}
    </h2>
    {#if model.newBest}<div class="sv-best">New best</div>{/if}
    <div class="sv-time" aria-label={`Time ${formatTime(model.time)}`}>
      {formatTime(model.time)}
    </div>
    {#if "lastDelta" in model && model.lastDelta !== null}<div
        class="sv-last"
        class:slower={model.lastDelta > 0}
      >
        比上次{model.lastDelta > 0 ? "慢" : "快"}
        {formatTime(Math.abs(model.lastDelta))}
      </div>{/if}
    {#if model.third}<dl>
        {#if model.delta !== null}<div>
            <dt>vs average</dt>
            <dd
              class:faster={model.delta <= 0}
              aria-label={`${spokenTime(model.delta)} ${model.delta > 0 ? "slower" : "faster"} than average`}
            >
              {model.delta > 0 ? "+" : "−"}{formatTime(Math.abs(model.delta))}
            </dd>
          </div>{/if}
        {#if model.streak > 0}<div>
            <dt>day streak</dt>
            <dd><span class="flame"><Icon name="flame" /></span>{model.streak}</dd>
          </div>{/if}
        <div>
          <dt>{model.third.label}</dt>
          <dd>
            {#if model.third.unlocked}<Icon name="lock-open" />{/if}{model.third.value}
          </dd>
        </div>
      </dl>{/if}
    {#if model.feeling}<div class="sv-feel" role="group" aria-labelledby="sv-feel-l">
        <p id="sv-feel-l" class="sv-feel-l">
          這題感覺如何？ <span class="sv-feel-skip">可略過</span>
        </p>
        <div class="sv-feel-row">
          {#each feelings as [value, label] (value)}<button
              class="sv-feel-chip"
              class:is-on={feedback === value}
              aria-pressed={feedback === value}
              disabled={feedbackPending}
              onclick={async () => {
                feedbackPending = true;
                const next = feedback === value ? undefined : value;
                try {
                  if (await onfeedback(next)) feedback = next;
                } finally {
                  feedbackPending = false;
                }
              }}>{label}</button
            >{/each}
        </div>
      </div>{/if}
    <div class="sv-actions">
      <button class="sv-next" onclick={onnext}
        ><Icon name="play" /><span>{model.label}</span><kbd aria-hidden="true">Enter</kbd></button
      >{#if resumeLabel}<button class="sv-resume" onclick={onresume}
          ><Icon name="history" />{resumeLabel}</button
        >{/if}
    </div>
  </div>
</section>
<p class="sv-live" aria-live="polite">
  Solved in {spokenTime(model.time)}.{model.newBest ? " New best." : ""}
</p>

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
  .sv-best,
  .sv-last {
    margin-top: 6px;
    font: 600 15px/1.3 var(--ui-font);
    color: var(--cue-ink);
  }
  .sv-last.slower {
    color: var(--ui-soft);
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
    position: relative;
  }
  dl > div + div::before {
    content: "";
    position: absolute;
    left: 0;
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
    margin-top: 14px;
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
  .sv-next > :global(svg) {
    flex-shrink: 0;
  }
  .sv-next:hover {
    background: var(--blue-d);
  }
  .sv-resume {
    height: 44px;
    background: transparent;
    color: var(--blue);
  }
  .sv-resume:hover {
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
    .sv-best,
    .sv-last {
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
    dt {
      font-size: 14px;
    }
    dd {
      font-size: 21px;
      height: 25px;
      --ic: 18px;
    }
    .sv-actions {
      margin-top: 18px;
      gap: 7px;
    }
    .sv-next {
      height: 56px;
      border-radius: 11px;
      --ic: 18px;
    }
    .sv-resume {
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
  .sv-feel {
    margin-top: 12px;
    text-align: center;
  }
  .sv-feel-l {
    margin: 0;
    font: 500 14px/1.35 var(--ui-font);
    color: var(--ui-ink);
  }
  .sv-feel-skip {
    color: var(--ui-soft);
    font-weight: 500;
  }
  .sv-feel-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 8px;
  }
  .sv-feel-chip {
    flex: 0 1 auto;
    min-width: 0;
    width: auto;
    height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: var(--card);
    box-shadow: inset 0 0 0 1px var(--hair);
    color: var(--ui-ink);
    font: 600 13px/1 var(--ui-font);
    cursor: pointer;
  }
  .sv-feel-chip:hover {
    background: var(--neutral-2);
  }
  .sv-feel-chip.is-on {
    background: var(--sel);
    box-shadow: inset 0 0 0 1.5px var(--blue);
    color: var(--blue-d);
  }
  @media (min-width: 600px) {
    .sv-feel-row {
      flex-direction: column;
      gap: 6px;
    }
    .sv-feel-chip {
      flex: none;
      width: 100%;
    }
    .sv-feel {
      margin-top: 14px;
    }
  }
</style>
