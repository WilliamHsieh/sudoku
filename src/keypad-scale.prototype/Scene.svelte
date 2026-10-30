<script>
  // Throwaway: three proportional keypad sizes in the upstream play screen.
  // Reuses the real cells, keys, tools, header, fonts and review fixture.
  import { onMount, tick } from "svelte";
  import Cell from "../Cell.svelte";
  import Keypad from "../Keypad.svelte";
  import Tools from "../Tools.svelte";
  import PlayHeader from "../PlayHeader.svelte";
  import { game, DEMO_PUZZLE } from "../game/game.svelte.js";
  import { applyKeypadShot } from "../play/keypad-shot.js";
  import { padUi } from "../pad-ui.svelte.js";
  import { timerRunning } from "../store.js";
  import { hintModel } from "../keypad-copy.js";
  import { placedCount } from "../keypad-actions.js";

  const ids = Array.from({ length: 81 }, (_, i) => i);
  let narrow = $state(innerWidth < 600);
  let target = $state(1);
  let upstream = $state(false);
  let mainEl;
  let slot;
  let padSlot;
  let chrome;
  let scale = 1;
  let pending = false;
  let again = false;
  const noop = () => {};
  const hint = $derived(
    hintModel({
      legacy: false,
      locked: padUi.locked,
      shown: padUi.locked ? 0 : padUi.shown,
      placed: placedCount(padUi.locked || padUi.shown),
    })
  );

  game.load(DEMO_PUZZLE, { dateStr: "2026-10-30", difficulty: "medium" });
  applyKeypadShot(game, "digit-shown");
  timerRunning.set(false);

  async function layout() {
    if (pending) {
      again = true;
      return;
    }
    pending = true;
    narrow = innerWidth < 600;
    document.documentElement.style.setProperty("--scene-height", `${innerHeight}px`);
    await tick();
    if (narrow && slot && padSlot && chrome) {
      const width = mainEl.clientWidth - 16;
      // Reserve a full-width square first. Only the keypad yields vertically.
      // 70% is a prototype comparison floor, not a selected product policy.
      const nonKeyHeight = chrome.offsetHeight - padSlot.offsetHeight;
      const room = innerHeight - 16 - slot.getBoundingClientRect().top - 12 - nonKeyHeight;
      scale = upstream ? 1 : Math.min(target, Math.max(0.7, (room - width) / 208));
      mainEl.style.setProperty("--pad-scale", String(scale));
      mainEl.style.setProperty("--pad-height", `${208 * scale}px`);
    }
    await tick();
    requestAnimationFrame(() => {
      const board = document.querySelector(".board").getBoundingClientRect();
      const key = document.querySelector(".key").getBoundingClientRect();
      const pad = document.querySelector(".keypad").getBoundingClientRect();
      parent.postMessage(
        {
          type: "keypad-prototype-metrics",
          id: document.documentElement.dataset.mockId,
          width: innerWidth,
          height: innerHeight,
          narrow,
          target,
          scale: narrow ? scale : 0,
          board: board.width,
          boardTop: board.top,
          boardBottom: board.bottom,
          keyWidth: key.width,
          keyHeight: key.height,
          padWidth: pad.width,
          padHeight: pad.height,
          padBottom: pad.bottom,
          naturalBoard: narrow ? innerWidth - 16 : Math.min(650, innerWidth - 32),
          overflow: document.documentElement.scrollWidth > innerWidth,
        },
        "*"
      );
      pending = false;
      if (again) {
        again = false;
        void layout();
      }
    });
  }

  onMount(() => {
    const receive = (event) => {
      if (event.source !== parent || event.data?.type !== "keypad-prototype-config") return;
      target = event.data.target;
      upstream = event.data.upstream;
      if (event.data.highlight !== undefined) padUi.shown = event.data.highlight ? 5 : 0;
      void layout();
    };
    const resetCoach = () => {
      padUi.coach = false;
    };
    resetCoach();
    window.addEventListener("message", receive);
    window.addEventListener("resize", layout);
    document.fonts.ready.then(layout);
    void layout();
    parent.postMessage(
      { type: "keypad-prototype-ready", id: document.documentElement.dataset.mockId },
      "*"
    );
    return () => {
      window.removeEventListener("message", receive);
      window.removeEventListener("resize", layout);
    };
  });
</script>

<main bind:this={mainEl}>
  <PlayHeader
    journal={false}
    {narrow}
    hasPlayed={true}
    frozenElapsed={767}
    freshTarget={null}
    ondate={noop}
    ontime={noop}
    onbrand={noop}
  />
  <div class="play">
    <div class="board-slot" bind:this={slot}>
      <div class="board-wrap">
        <div class="board">
          {#each ids as id}<Cell cell_id={id} />{/each}
        </div>
      </div>
    </div>
    <div class="mobile-chrome" bind:this={chrome}>
      <div class="chrome-dim">
        <Tools />
        <div class="pad-slot" bind:this={padSlot}><div class="pad-scale"><Keypad /></div></div>
      </div>
      <div class="hint-line">
        <p class="pad-hint">
          {#if hint.kind === "plain"}{hint.text}{:else}<b>{hint.lead}</b>{hint.rest}{/if}
        </p>
      </div>
    </div>
  </div>
</main>

<style>
  /* Layout copied from App.svelte at origin/master cc31b20. The only new
     layout elements are pad-slot/pad-scale, which reclaim scaled space. */
  main {
    --pad-scale: 1;
    --pad-height: 208px;
    width: 100%;
    display: flex;
    flex-direction: column;
    height: var(--scene-height);
    max-height: var(--scene-height);
    min-height: 0;
    padding: 16px;
    font-family: var(--ui-font);
    color: var(--ui-ink);
    background: var(--page-bg);
    overflow: visible;
  }
  .play {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
  }
  .board-slot {
    display: contents;
  }
  .board-wrap {
    position: relative;
    max-width: 650px;
    width: 100%;
    margin: 0 auto 32px;
  }
  .board {
    container-type: inline-size;
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    width: 100%;
    aspect-ratio: 1;
    border: var(--line-outer-w) solid var(--line-outer);
    border-radius: var(--board-radius);
    overflow: hidden;
    background: var(--board-bg);
    user-select: none;
    touch-action: manipulation;
    overscroll-behavior: none;
  }
  .mobile-chrome {
    display: none;
  }
  .pad-hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    line-height: normal;
    color: var(--ui-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pad-hint b {
    font-weight: 600;
    color: var(--ui-ink);
  }
  .hint-line {
    display: grid;
    align-items: center;
    font-size: 12px;
    line-height: normal;
  }
  .pad-slot {
    width: 100%;
    height: var(--pad-height);
    flex: none;
  }
  .pad-scale {
    width: 100%;
    transform: scale(var(--pad-scale));
    transform-origin: top center;
  }
  @media (max-width: 768px) {
    main {
      padding: 12px;
    }
    .board-wrap {
      max-width: 100%;
      margin-bottom: 24px;
    }
  }
  @media (max-width: 599px) {
    main {
      gap: 12px;
      padding: 8px 8px 16px;
    }
    .board {
      grid-template-columns: repeat(9, minmax(0, 1fr));
      grid-template-rows: repeat(9, minmax(0, 1fr));
      touch-action: none;
    }
    .play {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .board-slot {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      flex: 0 1 auto;
      min-width: 0;
      min-height: 0;
      width: 100%;
      max-height: 100%;
      aspect-ratio: 1;
      container-type: size;
    }
    .board-wrap {
      width: min(100cqw, 100cqh);
      max-width: 100%;
      margin: 0;
    }
    .mobile-chrome {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: none;
    }
    .chrome-dim {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }
  @media (min-width: 600px) {
    main {
      padding: 0;
    }
    main > .play {
      padding: 0 16px 16px;
    }
    .play {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .board-slot {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      flex: 0 1 auto;
      width: min(650px, 100%);
      max-height: 100%;
      aspect-ratio: 1;
      min-width: 160px;
      min-height: 160px;
      container-type: size;
    }
    .board-wrap {
      width: min(100cqw, 100cqh);
      max-width: none;
      margin: 0;
    }
  }
</style>
