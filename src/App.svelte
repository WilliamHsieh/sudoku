<script>
  import Api from "./Api.svelte";
  import Cell from "./Cell.svelte";
  import Timer from "./Timer.svelte";
  import Journal from "./Journal.svelte";
  import Tools from "./Tools.svelte";
  import Keypad from "./Keypad.svelte";
  import { get } from "svelte/store";
  import { done, puzzleProgress, solvedPuzzles } from "./store";
  import { game } from "./game/game.svelte.js";
  import { firstUnsolvedLatest } from "./game/daily.js";
  import { puzzleData } from "./puzzles.js";
  import { unfinishedList } from "./journal/stats.js";
  import { ring } from "./ring.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { installIosZoomGuards } from "./ios-zoom.js";
  import { installShiftHover, isShiftAim } from "./shift-hover.svelte.js";
  import { playUi } from "./play/session.svelte.js";
  import { applyShot } from "./play/shot.js";
  import PausedCover from "./PausedCover.svelte";
  import OptionsSheet from "./OptionsSheet.svelte";
  import { onMount, tick } from "svelte";

  game.setOnActivity(() => playUi.noteActivity());
  game.setOnLoad(() => playUi.resetForLoad());
  playUi.bindLones(() => {
    if (game.notesMode !== "auto") return [];
    const ids = [];
    for (let i = 0; i < 81; i++) {
      if (game.value(i) === 0 && game.noteCount(i) === 1) ids.push(i);
    }
    return ids;
  });

  /** @param {string} id */
  function focusId(id) {
    document.getElementById(id)?.focus({ preventScroll: true });
  }

  /** @param {boolean} nowPaused */
  async function focusAfterPause(nowPaused) {
    await tick();
    focusId(nowPaused ? "resume" : "pause");
  }

  function onPauseClick() {
    const result = playUi.toggle();
    if (result === "paused") focusAfterPause(true);
    else if (result === "resumed") focusAfterPause(false);
  }

  function onResumeCover() {
    if (playUi.resume()) focusAfterPause(false);
  }

  function focusMore() {
    const el = [...document.querySelectorAll("[data-more]")].find(
      (node) => node instanceof HTMLElement && node.offsetParent
    );
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }

  const CELL_IDS = Array.from({ length: 81 }, (_, i) => i);
  const NARROW_MQ = "(max-width: 599px)";

  let showCalendar = $state(true);
  let hasPlayed = $state(false);
  let isNarrow = $state(typeof window !== "undefined" && window.matchMedia(NARROW_MQ).matches);
  let wrapEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let ringEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));

  function handleKeydown(e) {
    const cmd = e.ctrlKey || e.metaKey;
    // Only these chords are undo/redo. Ctrl/Alt/Meta+digit follows master and
    // still enters the digit.
    if (e.ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      game.redo();
      return;
    }
    if (cmd && e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      game.redo();
      return;
    }
    if (cmd && e.key.toLowerCase() === "z") {
      e.preventDefault();
      game.undo();
      return;
    }

    if (game.selected == -1) return;
    const id = game.selected;

    if (e.key >= "0" && e.key <= "9" && game.editable(id)) {
      const d = parseInt(e.key, 10);
      if (d === 0) game.clearAnswer(id);
      else game.fill(id, d);
    } else if (e.key == "ArrowLeft" && id % 9) {
      game.select(id - 1);
    } else if (e.key == "ArrowRight" && (id + 1) % 9) {
      game.select(id + 1);
    } else if (e.key == "ArrowUp" && id >= 9) {
      game.select(id - 9);
    } else if (e.key == "ArrowDown" && id + 9 < 81) {
      game.select(id + 9);
    } else {
      return;
    }
    e.preventDefault();
  }

  function handleGlobalKeydown(e) {
    if (playUi.modal) return;
    const plainP =
      (e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (plainP) {
      e.preventDefault();
      onPauseClick();
      return;
    }
    if (playUi.paused) return;
    playUi.noteActivity();
    if (e.key === "Escape" && $done) {
      game.dismiss();
    } else {
      handleKeydown(e);
    }
  }

  /** @param {PointerEvent} e */
  function onPlayPointer(e) {
    if (playUi.paused) return;
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(".play")) playUi.noteActivity();
  }

  function removeFocus() {
    game.select(-1);
  }

  function handleSuccessBackdrop(event) {
    if (event.target === event.currentTarget) {
      game.dismiss();
    }
  }

  function openJournal() {
    game.flushProgress();
    showCalendar = true;
    playUi.noteActivity();
  }

  function hasQueryPuzzle() {
    return /^[0-9]{81}$/.test(new URLSearchParams(window.location.search).get("q") ?? "");
  }

  function playFromJournal() {
    if (!hasPlayed && !hasQueryPuzzle()) {
      const list = unfinishedList(get(puzzleProgress), get(solvedPuzzles));
      const recent = list[0];
      const puzzle = recent ? puzzleData[recent.date]?.[recent.diff] : null;
      if (recent && puzzle) {
        game.load(puzzle, {
          dateStr: recent.date,
          difficulty: recent.diff,
          snapshot: recent.snapshot,
          elapsed: recent.elapsed,
        });
      } else {
        const pick = firstUnsolvedLatest(puzzleData, get(solvedPuzzles));
        if (pick) {
          game.load(pick.puzzle, { dateStr: pick.dateStr, difficulty: pick.difficulty });
        }
      }
    }
    playUi.start();
    hasPlayed = true;
    showCalendar = false;
  }

  function handleLoadPuzzle(event) {
    console.log("Puzzle loaded from calendar:", event.detail);
    playUi.start();
    hasPlayed = true;
    showCalendar = false;
  }

  onMount(() => {
    const mq = window.matchMedia(NARROW_MQ);
    isNarrow = mq.matches;
    const onNarrow = () => {
      isNarrow = mq.matches;
    };
    mq.addEventListener("change", onNarrow);
    game.setBeforeMutate(() => ring.flush());
    window.addEventListener("loadPuzzle", handleLoadPuzzle);
    const stopShiftHover = installShiftHover();
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shotParams = new URLSearchParams(window.location.search);
    const reducedOn = () => reduceMq.matches || shotParams.get("rm") === "1";
    playUi.setReduced(reducedOn());
    const onReduce = () => playUi.setReduced(reducedOn());
    reduceMq.addEventListener("change", onReduce);
    const onVis = () => {
      if (!document.hidden && document.visibilityState !== "hidden") return;
      if (playUi.pause()) focusAfterPause(true);
    };
    document.addEventListener("visibilitychange", onVis);
    const shot = shotParams.get("shot");
    if (shot) {
      applyShot(game, shot === "manual");
      hasPlayed = true;
      showCalendar = false;
    }
    return () => {
      mq.removeEventListener("change", onNarrow);
      reduceMq.removeEventListener("change", onReduce);
      document.removeEventListener("visibilitychange", onVis);
      game.setBeforeMutate(() => {});
      game.setOnActivity(() => {});
      game.setOnLoad(() => {});
      ring.destroy();
      stopShiftHover();
      window.removeEventListener("loadPuzzle", handleLoadPuzzle);
    };
  });

  $effect(() => {
    playUi.setAuto(game.notesMode === "auto");
  });

  $effect(() => {
    playUi.setSolved(game.solved);
  });

  $effect(() => {
    if (showCalendar) return;
    playUi.start();
  });

  $effect(() => {
    if (showCalendar) return;
    if (wrapEl && ringEl) ring.bind(wrapEl, ringEl);
    const mobile = window.matchMedia("(max-width: 599px)").matches;
    const stopZoom = mobile ? installIosZoomGuards() : () => {};
    return () => {
      stopZoom();
      ring.destroy();
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<main class:on-journal={showCalendar}>
  <Api />
  {#if !isNarrow}
    <div class="header" class:playing={!showCalendar}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <h1 onclick={removeFocus}>Sudoku</h1>
      {#if !showCalendar}
        <Timer />
        <button
          class="dhbtn"
          id="pause"
          type="button"
          aria-pressed={playUi.paused}
          aria-label={playUi.paused ? "Resume" : "Pause"}
          title={playUi.paused ? "Resume (P)" : "Pause (P)"}
          onclick={onPauseClick}
        >
          <svg class="ic pz ic-pause" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6.5" y="5" width="3.6" height="14" rx="1"></rect>
            <rect x="13.9" y="5" width="3.6" height="14" rx="1"></rect>
          </svg>
          <svg class="ic play-ic ic-play" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
            ></path>
          </svg>
        </button>
        <button
          class="dhbtn"
          type="button"
          data-more
          aria-label="More"
          title="More options"
          aria-haspopup="dialog"
          disabled={playUi.paused}
          onclick={() => playUi.openOptions()}
        >
          <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
      {/if}
      <nav class="seg" aria-label="Views">
        <button
          type="button"
          aria-current={!showCalendar ? "page" : undefined}
          onclick={playFromJournal}
        >
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="18" height="18" x="3" y="3" rx="2"></rect>
            <path d="M3 9h18"></path>
            <path d="M3 15h18"></path>
            <path d="M9 3v18"></path>
            <path d="M15 3v18"></path>
          </svg>
          Play
        </button>
        <button
          type="button"
          aria-current={showCalendar ? "page" : undefined}
          onclick={openJournal}
        >
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 2v3"></path>
            <path d="M16 2v3"></path>
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <path d="M3 9h18"></path>
            <path d="M8 13h.01"></path>
            <path d="M12 13h.01"></path>
            <path d="M16 13h.01"></path>
            <path d="M8 17h.01"></path>
            <path d="M12 17h.01"></path>
            <path d="M16 17h.01"></path>
          </svg>
          Journal
        </button>
      </nav>
    </div>
  {:else}
    <header class="hd">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <h1 class="hd-brand" onclick={removeFocus}>Sudoku</h1>
      <div class="hd-r">
        {#if showCalendar}
          <button class="hpill" type="button" aria-label="Back to puzzle" onclick={playFromJournal}>
            <span class="face"
              ><svg
                class="ic"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                <path d="M3 9h18"></path>
                <path d="M3 15h18"></path>
                <path d="M9 3v18"></path>
                <path d="M15 3v18"></path></svg
              >Play</span
            >
          </button>
        {:else}
          <button class="hbtn cal" type="button" aria-label="Journal" onclick={openJournal}>
            <span class="face"
              ><svg
                class="ic"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 2v3"></path>
                <path d="M16 2v3"></path>
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <path d="M3 9h18"></path>
                <path d="M8 13h.01"></path>
                <path d="M12 13h.01"></path>
                <path d="M16 13h.01"></path>
                <path d="M8 17h.01"></path>
                <path d="M12 17h.01"></path>
                <path d="M16 17h.01"></path>
              </svg></span
            >
          </button>
          <Timer />
          <button
            class="hbtn"
            id="pause"
            type="button"
            aria-pressed={playUi.paused}
            aria-label={playUi.paused ? "Resume" : "Pause"}
            onclick={onPauseClick}
          >
            <span class="face">
              <svg class="ic pz ic-pause" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6.5" y="5" width="3.6" height="14" rx="1"></rect>
                <rect x="13.9" y="5" width="3.6" height="14" rx="1"></rect>
              </svg>
              <svg class="ic play-ic ic-play" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
                ></path>
              </svg>
            </span>
          </button>
        {/if}
      </div>
    </header>
  {/if}

  {#if showCalendar}
    <Journal />
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="play" class:is-paused={playUi.paused} onpointerdown={onPlayPointer}>
      <div class="board-wrap" bind:this={wrapEl}>
        <div
          class="board"
          class:quiet={padUi.quiet}
          class:shift-aim={isShiftAim()}
          aria-hidden={playUi.paused ? "true" : undefined}
          inert={playUi.paused}
          data-cue-phase={playUi.phase}
        >
          {#each CELL_IDS as id (id)}
            <Cell cell_id={id} />
          {/each}
        </div>
        {#if playUi.paused}
          <PausedCover showKey={!isNarrow} onresume={onResumeCover} />
        {/if}
        <div class="undo-ring" bind:this={ringEl} aria-hidden="true"></div>
      </div>
      <div class="mobile-chrome">
        <div class="chrome-dim" class:dim={playUi.paused} inert={playUi.paused}>
          <Tools />
          <Keypad />
        </div>
        <p class="pad-hint">Tap = answer · Swipe up = candidate</p>
      </div>
    </div>

    <OptionsSheet onclosed={focusMore} onrestart={() => game.restart()} />

    {#if $done}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="success-message" onclick={handleSuccessBackdrop}>
        <div class="success-card">
          <button class="success-close" onclick={() => game.dismiss()}>&times;</button>
          <div class="success-icon">🎉</div>
          <h2>Puzzle Complete!</h2>
          <p>Congratulations! You've successfully solved the Sudoku puzzle.</p>
        </div>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100%;
    min-height: 100vh;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    font-family: var(--ui-font);
    color: var(--ui-ink);
    background: var(--page-bg);
    overflow-x: hidden;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 auto 24px;
    padding: 8px 0 16px;
    border-bottom: var(--line-thin-w) solid var(--line-thin);
    max-width: 1200px;
  }

  .header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--ui-ink);
    cursor: pointer;
  }

  .header :global(.timer) {
    margin-left: auto;
  }

  .seg {
    display: flex;
    background: var(--neutral);
    border-radius: 10px;
    padding: 3px;
    margin-left: auto;
  }
  .header.playing {
    gap: 8px;
  }
  .header.playing .seg {
    margin-left: 6px;
  }
  .seg button {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink2);
    padding: 6px 14px;
    border-radius: 8px;
    display: flex;
    gap: 7px;
    align-items: center;
    font-family: var(--ui-font);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .seg button[aria-current] {
    background: var(--card);
    color: var(--ink);
    box-shadow: 0 1px 2px rgb(28 26 22 / 0.12);
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    flex: none;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hd {
    display: none;
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
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }

  .undo-ring {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 4;
    box-sizing: border-box;
    border: 2.5px solid var(--undo-ring);
    border-radius: 4px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--undo-ring) 18%, transparent);
    pointer-events: none;
    opacity: 0;
  }

  .board.shift-aim,
  .board.shift-aim :global(.cell) {
    cursor: crosshair;
  }

  .board.quiet :global(.cell.same:not(.conflict)) {
    background: var(--board-bg);
  }
  .board.quiet :global(.cell.same.given:not(.conflict)) {
    background: var(--given-bg);
  }
  .board.quiet :global(.pencil-box.matching-number:not(.cue)) {
    color: var(--cand);
    background: transparent;
    box-shadow: none;
  }

  .mobile-chrome {
    display: none;
  }

  .pad-hint {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--ui-soft);
  }

  .success-message {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .success-card {
    background: var(--board-bg);
    color: var(--ui-ink);
    padding: 48px 32px;
    border-radius: 16px;
    text-align: center;
    max-width: 400px;
    box-shadow: var(--shadow-dialog);
    position: relative;
  }

  .success-icon {
    font-size: 4rem;
    margin-bottom: 16px;
  }

  .success-card h2 {
    margin: 0 0 16px;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--ui-ink);
  }

  .success-card p {
    margin: 0;
    color: var(--ui-soft);
    font-size: 1.05rem;
    line-height: 1.6;
  }

  .success-close {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--ui-soft);
    padding: 4px;
    border-radius: 4px;
    line-height: 1;
  }

  .success-close:hover {
    background: var(--given-bg);
    color: var(--ui-ink);
  }

  @media (max-width: 768px) {
    main {
      padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    }

    .header {
      margin-bottom: 16px;
      padding: 4px 0 12px;
    }

    .board-wrap {
      max-width: 100%;
      margin-bottom: 24px;
    }

    .success-card {
      margin: 16px;
      padding: 32px 24px;
    }
  }

  /* Prototype used 600px as the wide-board line; the pad lives below that so
     1280 desktop chrome (and every existing e2e test) stays unchanged. */
  @media (max-width: 599px) {
    /* Mockup C: 8px sides and top, 16px bottom. The 768px rule's 12px
       would shrink the board to 366 and the keys below 119.33. */
    main {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
        max(16px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
    }

    /* Clip lock on the pad. Desktop keeps master's `1fr` columns and
       implicit rows so 1280 idle tracks stay pixel-identical; cells and
       the notes grid already use minmax(0,1fr) + min-width:0. */
    .board {
      grid-template-columns: repeat(9, minmax(0, 1fr));
      grid-template-rows: repeat(9, minmax(0, 1fr));
    }

    .board-wrap {
      margin-bottom: 0;
    }

    .play {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mobile-chrome {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chrome-dim {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chrome-dim.dim {
      opacity: 0.4;
    }

    .play.is-paused .board {
      visibility: hidden;
    }

    .header {
      display: none;
    }

    /* H2 header — exact rules from h2-play.html / h2-journal.html */
    .hd,
    .hd * {
      box-sizing: border-box;
    }
    .hd {
      --hd-ink: #1c1a16;
      --hd-soft: #5d584f;
      --hd-neutral: #e5e4e0;
      --hd-line: rgb(0 0 0 / 0.08);
      --hd-face: rgb(255 255 255 / 0.7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 44px;
      padding: 0 16px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
      color: var(--hd-ink);
    }
    .hd-brand {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1;
      margin: 0;
    }
    .hd-r {
      display: flex;
      align-items: center;
    }
    .hd .ic {
      width: 16px;
      height: 16px;
      flex: none;
      stroke-width: 2;
    }
    .hbtn {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .hbtn .face {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: 1px solid var(--hd-line, rgb(0 0 0 / 0.08));
      border-radius: 8px;
      background: var(--hd-face, rgb(255 255 255 / 0.7));
    }
    .pz rect {
      fill: currentColor;
      stroke: none;
    }
    .play-ic {
      display: none;
    }
    .play-ic path {
      fill: currentColor;
      stroke: none;
    }
    #pause[aria-pressed="true"] .ic-pause {
      display: none;
    }
    #pause[aria-pressed="true"] .ic-play {
      display: block;
      width: 15px;
      height: 15px;
    }
    #pause[aria-pressed="true"] .face {
      background: var(--neutral);
      border-color: rgb(28 26 22 / 0.18);
    }
    .hbtn:focus {
      outline: none;
    }
    .hbtn:focus-visible {
      outline: none;
    }
    .hbtn:focus-visible .face {
      outline: 2px solid var(--focus);
      outline-offset: 1px;
    }
    .hbtn:active .face {
      background: var(--key-pressed);
    }
    .hbtn.cal {
      margin-right: 3px;
    }
    .hd-r > .hbtn:last-child {
      margin-right: -7px;
    }
    .hpill {
      height: 44px;
      display: flex;
      align-items: center;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .hpill .face {
      height: 30px;
      width: 69.75px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px 0 8px;
      border: 1px solid var(--hd-line, rgb(0 0 0 / 0.08));
      border-radius: 8px;
      background: var(--hd-face, rgb(255 255 255 / 0.7));
      font-size: 14.4px;
      font-weight: 600;
    }
    main > .hd {
      margin: -3px -8px -7px;
    }

    main.on-journal {
      gap: 18px;
      padding-bottom: max(40px, env(safe-area-inset-bottom));
    }
  }

  @media (min-width: 600px) {
    .dhbtn {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid var(--timer-line);
      border-radius: 8px;
      background: var(--timer-bg);
      color: var(--timer-ink);
      cursor: pointer;
      font: inherit;
    }
    .dhbtn .ic {
      width: 16px;
      height: 16px;
      flex: none;
    }
    .dhbtn .pz rect {
      fill: currentColor;
      stroke: none;
    }
    .dhbtn .ic-play {
      display: none;
    }
    .dhbtn .play-ic path {
      fill: currentColor;
      stroke: none;
    }
    .dhbtn[aria-pressed="true"] .ic-pause {
      display: none;
    }
    .dhbtn[aria-pressed="true"] .ic-play {
      display: block;
      width: 15px;
      height: 15px;
    }
    .dhbtn[aria-pressed="true"] {
      background: var(--neutral);
      border-color: rgb(28 26 22 / 0.18);
    }
    .dhbtn:focus {
      outline: none;
    }
    .dhbtn:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .dhbtn:disabled {
      opacity: 1;
      color: var(--timer-ink);
      background: var(--timer-bg);
      border-color: var(--timer-line);
      cursor: default;
    }
    .dhbtn .ic {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .dhbtn .pz {
      fill: none;
      stroke: none;
    }

    main.on-journal {
      padding: 0;
    }
    main.on-journal .header {
      height: 64px;
      margin: 0;
      max-width: none;
      padding: 0 32px;
      border-bottom: 1px solid var(--hair);
      box-sizing: border-box;
    }
    main.on-journal .header h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
  }

  @media (min-width: 600px) and (hover: hover) {
    .dhbtn:hover:not(:disabled) {
      background: #ffffff;
      border-color: rgb(28 26 22 / 0.22);
    }
    .dhbtn[aria-pressed="true"]:hover {
      background: #dcdad4;
    }
  }
</style>
