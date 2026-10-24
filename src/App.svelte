<script>
  import { paintBoard, discardPaint } from "./paint-actions.js";
  import Api from "./Api.svelte";
  import Cell from "./Cell.svelte";
  import PlayHeader from "./PlayHeader.svelte";
  import Journal from "./Journal.svelte";
  import Tools from "./Tools.svelte";
  import Keypad from "./Keypad.svelte";
  import { get } from "svelte/store";
  import { done, puzzleProgress, solvedPuzzles, timer, formatTime } from "./store";
  import { game } from "./game/game.svelte.js";
  import { firstUnsolvedLatest } from "./game/daily.js";
  import { puzzleData } from "./puzzles.js";
  import { unfinishedList } from "./journal/stats.js";
  import { ring } from "./ring.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { installIosZoomGuards } from "./ios-zoom.js";
  import { installShiftHover, isShiftAim, releaseShiftHover } from "./shift-hover.svelte.js";
  import { digitFromCode } from "./game/key-gesture.js";
  import {
    clearToast,
    lockDigit,
    lockTap,
    placedCount,
    resetKeypad,
    revealCellDigit,
    syncHighlightAfterEdit,
    unlockKeepShown,
  } from "./keypad-actions.js";
  import { hintModel } from "./keypad-copy.js";
  import { playUi, RESUME_REVEAL_MS, RESUME_EASE, RESUME_BLUR_PX } from "./play/session.svelte.js";
  import { applyShot } from "./play/shot.js";
  import { applyKeypadShot } from "./play/keypad-shot.js";
  import PausedCover from "./PausedCover.svelte";
  import OptionsSheet from "./OptionsSheet.svelte";
  import { onMount, tick } from "svelte";
  import { longDate } from "./journal/format.js";

  game.setOnActivity(() => playUi.noteActivity());
  game.setOnLoad(() => {
    playUi.resetForLoad();
    resetKeypad();
  });
  playUi.bindLones(() => {
    if (game.notesMode !== "auto") return [];
    const ids = [];
    for (let i = 0; i < 81; i++) {
      if (game.value(i) === 0 && game.noteCount(i) === 1) ids.push(i);
    }
    return ids;
  });

  /**
   * Move focus after a pause or resume.
   * The ring follows the last input: keyboard keeps `:focus-visible`,
   * pointer and touch do not. `focusVisible` is set where the browser
   * supports it; `modality-focus-ring` and `data-modality` cover the rest.
   * @param {string} id
   */
  function focusId(id) {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLElement)) return;
    const keyboard = document.documentElement.dataset.modality === "keyboard";
    for (const other of ["time-control", "resume"]) {
      if (other !== id) document.getElementById(other)?.classList.remove("modality-focus-ring");
    }
    el.classList.toggle("modality-focus-ring", keyboard);
    const options = { preventScroll: true, focusVisible: keyboard };
    el.focus(options);
  }

  /** @param {boolean} nowPaused */
  async function focusAfterPause(nowPaused) {
    await tick();
    focusId(nowPaused ? "resume" : "time-control");
  }

  function onPauseClick() {
    if (showCalendar) {
      playFromJournal();
      return;
    }
    const result = playUi.toggle();
    if (result === "paused") focusAfterPause(true);
    else if (result === "resumed") focusAfterPause(false);
  }

  function onResumeCover() {
    if (playUi.resume()) focusAfterPause(false);
  }

  async function announceResumed() {
    resumeStatus = "";
    await tick();
    resumeStatus = "Resumed";
    await focusAfterPause(false);
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
  let frozenElapsed = $state(0);
  let viewMotion = $state(false);
  /** @type {{date: string} | null} */
  let journalEntry = $state(null);
  const freshTarget = $derived(unfinishedList($puzzleProgress, $solvedPuzzles)[0] ?? null);
  let isNarrow = $state(typeof window !== "undefined" && window.matchMedia(NARROW_MQ).matches);
  /** Cover stays mounted through the fade-out. */
  let showCover = $state(false);
  let coverLeaving = $state(false);
  /** Phone board stays painted until the cover is opaque, then hides. */
  let concealBoard = $state(false);
  let automaticCover = $state(false);
  /** Snap chrome on a short return; the next pause restores normal motion. */
  let shortReturn = $state(false);

  function reduceMotion() {
    return (
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  $effect(() => {
    if (playUi.paused) {
      shortReturn = false;
      coverLeaving = false;
      showCover = true;
      automaticCover = playUi.reason === "auto";
      concealBoard = playUi.resumePhase !== "reveal" && reduceMotion();
      return;
    }
    concealBoard = false;
    if (!showCover) return;
    if (automaticCover || reduceMotion()) {
      showCover = false;
      coverLeaving = false;
      return;
    }
    coverLeaving = true;
  });
  /** Polite "Resumed". Stays empty for a short-absence instant resume. */
  let resumeStatus = $state("");
  /** `?reveal=mid` freezes the reveal at 120ms, about 49% visible under the ease. */
  let revealMid = $state(false);
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
      const before = game.value(id);
      if (d === 0) game.clearAnswer(id);
      else game.fill(id, d);
      syncHighlightAfterEdit(id, before);
    } else if (e.key == "ArrowLeft" && id % 9) {
      game.select(id - 1);
      revealCellDigit(id - 1);
    } else if (e.key == "ArrowRight" && (id + 1) % 9) {
      game.select(id + 1);
      revealCellDigit(id + 1);
    } else if (e.key == "ArrowUp" && id >= 9) {
      game.select(id - 9);
      revealCellDigit(id - 9);
    } else if (e.key == "ArrowDown" && id + 9 < 81) {
      game.select(id + 9);
      revealCellDigit(id + 9);
    } else {
      return;
    }
    e.preventDefault();
  }

  /** Shift+digit locks. Match `code`, because Shift turns the character into a symbol. */
  function tryShiftLock(e) {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
    const d = digitFromCode(e.code);
    if (!d) return false;
    e.preventDefault();
    if (padUi.locked === d) unlockKeepShown();
    else lockDigit(d);
    releaseShiftHover();
    return true;
  }

  /** Space or Enter toggles the locked digit in the selected cell, unless a control has focus. */
  function tryLockedSpace(e) {
    if (!padUi.locked || (e.key !== " " && e.key !== "Enter")) return false;
    if (e.target instanceof Element && e.target.closest("button, a, input, textarea, select")) {
      return false;
    }
    e.preventDefault();
    if (game.selected >= 0) lockTap(game.selected);
    return true;
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
    if (e.key === "Escape") {
      if (showCalendar) return;
      if (discardPaint()) {
        e.preventDefault();
        return;
      }
      if (padUi.locked) {
        e.preventDefault();
        unlockKeepShown();
        return;
      }
      if ($done) game.dismiss();
      return;
    }
    if (tryShiftLock(e) || tryLockedSpace(e)) return;
    handleKeydown(e);
  }

  /** Board/keypad pointer input releases the header's keyboard focus. */
  function releaseViewFocus(e) {
    if (!(e.target instanceof Element) || !e.target.closest(".board, #keypad")) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".tp, .dbtn, .notes-mode")) active.blur();
  }

  function removeFocus() {
    game.select(-1);
  }

  function handleSuccessBackdrop(event) {
    if (event.target === event.currentTarget) {
      game.dismiss();
    }
  }

  async function openJournal() {
    game.flushProgress();
    frozenElapsed = get(timer);
    journalEntry = game.dateStr ? { date: game.dateStr } : null;
    viewMotion = true;
    showCalendar = true;
    resumeStatus = `Journal${game.dateStr ? ", " + longDate(game.dateStr) : ""}. Game paused at ${formatTime(frozenElapsed)}.`;
    await tick();
    if (isNarrow || !journalEntry) focusId("time-control");
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
    backToGame();
  }

  /** Shared by C, P, and Resume for the current puzzle. Never reload history. */
  function backToGame(fromSheet = false) {
    playUi.start();
    playUi.resume();
    if (!playUi.paused) {
      showCover = false;
      coverLeaving = false;
    }
    viewMotion = !fromSheet;
    hasPlayed = true;
    showCalendar = false;
    void announceResumed();
  }

  function handleLoadPuzzle() {
    playUi.start();
    hasPlayed = true;
    viewMotion = true;
    showCalendar = false;
  }

  onMount(() => {
    window.addEventListener("pointerdown", releaseViewFocus, true);
    const mq = window.matchMedia(NARROW_MQ);
    isNarrow = mq.matches;
    const onNarrow = () => {
      isNarrow = mq.matches;
    };
    mq.addEventListener("change", onNarrow);
    game.setBeforeMutate(() => {
      discardPaint();
      ring.flush();
    });
    window.addEventListener("loadPuzzle", handleLoadPuzzle);
    const stopShiftHover = installShiftHover();
    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shotParams = new URLSearchParams(window.location.search);
    const elapsed = shotParams.get("elapsed");
    if (elapsed && /^\d+$/.test(elapsed)) timer.set(Number(elapsed));
    const reducedOn = () => reduceMq.matches || shotParams.get("rm") === "1";
    playUi.setReduced(reducedOn());
    const onReduce = () => playUi.setReduced(reducedOn());
    reduceMq.addEventListener("change", onReduce);
    playUi.onAutoResume((info) => {
      if (info.announce) void announceResumed();
    });
    playUi.bindRevealCompletion(() =>
      Promise.all(
        (document.querySelector(".board")?.getAnimations() ?? [])
          .filter(
            (animation) =>
              animation instanceof CSSAnimation && animation.animationName.includes("rv-board")
          )
          .map((animation) => animation.finished)
      )
    );
    /** @param {KeyboardEvent} event */
    const noteKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      document.documentElement.dataset.modality = "keyboard";
    };
    const notePointer = () => {
      document.documentElement.dataset.modality = "pointer";
    };
    window.addEventListener("keydown", noteKey, true);
    window.addEventListener("pointerdown", notePointer, true);
    let hiddenAt = 0;
    const onVis = () => {
      const hidden = document.hidden || document.visibilityState === "hidden";
      if (hidden) {
        hiddenAt = Date.now();
        resumeStatus = "";
        if (playUi.noteHidden()) void focusAfterPause(true);
        return;
      }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      const silent = showCalendar;
      const result = playUi.noteVisible(away, { silent });
      shortReturn = result === "quiet" && !silent;
      if (result === "announced") void announceResumed();
      else if (result === "quiet" && !silent) void focusAfterPause(false);
    };
    document.addEventListener("visibilitychange", onVis);
    if (shotParams.has("freeze")) document.documentElement.classList.add("kp-freeze");
    revealMid = shotParams.get("reveal") === "mid";
    const shot = shotParams.get("shot");
    if (shot) {
      applyShot(game, shot === "manual");
      hasPlayed = true;
      showCalendar = false;
    }
    const kp = shotParams.get("kp");
    if (kp) {
      applyKeypadShot(game, kp);
      hasPlayed = true;
      showCalendar = false;
    }
    return () => {
      window.removeEventListener("pointerdown", releaseViewFocus, true);
      mq.removeEventListener("change", onNarrow);
      reduceMq.removeEventListener("change", onReduce);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", noteKey, true);
      window.removeEventListener("pointerdown", notePointer, true);
      playUi.onAutoResume(null);
      playUi.bindRevealCompletion(null);
      game.setBeforeMutate(() => {});
      game.setOnActivity(() => {});
      game.setOnLoad(() => {});
      ring.destroy();
      stopShiftHover();
      window.removeEventListener("loadPuzzle", handleLoadPuzzle);
    };
  });

  const hint = $derived.by(() => {
    const locked = padUi.locked;
    const shown = locked || padUi.shown;
    return hintModel({
      legacy: playUi.tapFill,
      locked,
      shown: locked ? 0 : padUi.shown,
      placed: placedCount(shown),
    });
  });

  $effect(() => {
    if (playUi.paused || playUi.modal) {
      discardPaint();
      unlockKeepShown();
      clearToast();
    }
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

<!-- Cover the PWA top blur without changing the safe-area padding. -->
<div class="top-strip" aria-hidden="true"></div>

<main class:on-journal={showCalendar}>
  <p id="resume-status" class="sr-only" aria-live="polite">{resumeStatus}</p>
  <Api />
  <PlayHeader
    journal={showCalendar}
    narrow={isNarrow}
    {hasPlayed}
    {frozenElapsed}
    {freshTarget}
    ondate={openJournal}
    ontime={onPauseClick}
    onbrand={removeFocus}
  />

  {#if showCalendar}
    <div class="journal-view" class:enter-journal={viewMotion && !playUi.reduced}>
      <Journal
        openOn={journalEntry}
        current={hasPlayed
          ? { date: game.dateStr, diff: game.difficulty, elapsed: frozenElapsed }
          : null}
        onback={backToGame}
      />
    </div>
  {:else}
    <div
      class="play"
      class:enter-play={viewMotion && !playUi.reduced}
      style:--resume-ms={`${RESUME_REVEAL_MS}ms`}
      style:--resume-ease={RESUME_EASE}
      style:--resume-blur={`${RESUME_BLUR_PX}px`}
      class:board-concealed={concealBoard}
      class:is-paused={playUi.paused}
      class:revealing={playUi.resumePhase === "reveal"}
      class:reveal-mid={revealMid}
      class:short-return={shortReturn}
      data-pause-reason={playUi.reason ?? "none"}
      data-resume-phase={playUi.resumePhase}
    >
      <p class="sr-only" aria-live="polite" aria-atomic="true">
        {#key padUi.commitId}<span>{padUi.announcement}</span>{/key}
      </p>
      <div class="board-slot">
        <div class="board-wrap" bind:this={wrapEl}>
          <div
            use:paintBoard
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
          {#if showCover}
            <PausedCover
              showKey={!isNarrow}
              leaving={coverLeaving}
              away={playUi.reason === "auto"}
              revealing={playUi.resumePhase === "reveal"}
              onresume={onResumeCover}
              onopaque={() => {
                if (playUi.paused && playUi.resumePhase !== "reveal" && !coverLeaving)
                  concealBoard = true;
              }}
              onleft={() => {
                showCover = false;
                coverLeaving = false;
              }}
            />
          {/if}
          <div class="undo-ring" bind:this={ringEl} aria-hidden="true"></div>
          {#if padUi.toast}
            <p class="toast" role="status">{padUi.toast}</p>
          {/if}
        </div>
      </div>
      <div class="mobile-chrome">
        <div class="chrome-dim" class:dim={playUi.paused} inert={playUi.paused}>
          <Tools />
          <Keypad />
        </div>
        <p class="pad-hint" aria-live="polite">
          {#if hint.kind === "plain"}
            {hint.text}
          {:else}
            <b>{hint.lead}</b>
            {hint.rest}
          {/if}
        </p>
      </div>
    </div>

    <OptionsSheet
      onclosed={focusMore}
      onrestart={() => {
        game.restart();
        resetKeypad();
      }}
    />

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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .top-strip {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: max(env(safe-area-inset-top), 6px);
    background: var(--page-bg);
    pointer-events: none;
    /* Above page content, below page dialogs (30) and scrims (40). */
    z-index: 20;
  }

  main {
    width: 100%;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100svh;
    height: 100dvh;
    max-height: 100dvh;
    min-height: 0;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
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

  /* Desktop: no box, so the board wrap stays in normal flow. Phone: see 599px. */
  .board-slot {
    display: contents;
  }

  main :global(.journal) {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  main :global(.journal) :global(.mobile),
  main :global(.journal) :global(.page.desktop) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
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
    overscroll-behavior: none;
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
  .board.quiet :global(.pencil-box.matching-number:not(.cue, .paint-added)) {
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

  .toast {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 12px;
    background: var(--primary);
    color: var(--on-accent);
    font-family: var(--ui-font);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    padding: 9px 14px;
    border-radius: 10px;
    box-shadow: var(--shadow-dialog);
    white-space: nowrap;
    z-index: 30;
    pointer-events: none;
    margin: 0;
  }

  .success-message {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: overlay-in var(--motion) var(--ease-out);
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
    animation: pop-in var(--motion) var(--ease-out);
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
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
      touch-action: none;
      overscroll-behavior: none;
    }

    .board-wrap {
      margin-bottom: 0;
    }

    .play {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Shrinks on a short viewport. The keypad stays in .mobile-chrome and does not scale. */
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
      transition: opacity var(--motion) var(--ease-out);
    }

    .chrome-dim.dim {
      opacity: 0.4;
    }

    .play.board-concealed .board {
      visibility: hidden;
    }

    main.on-journal {
      gap: 18px;
      /* The list scrolls to the screen edge. The safe area is padding inside .mobile. */
      padding-bottom: 0;
    }
  }

  /* Wide layout: the square is min(650px, the space under the header).
     Below 160px the page scrolls instead of shrinking the grid further. */
  @media (min-width: 600px) {
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

  @media (min-width: 600px) {
    main {
      padding: 0;
    }
    main:not(.on-journal) > .play {
      padding: 0 16px 16px;
    }
  }
  .journal-view {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .enter-journal {
    animation: enter-journal 260ms var(--ease-out) both;
  }
  .enter-play {
    animation: enter-play 260ms var(--ease-out) both;
  }
  @keyframes enter-journal {
    from {
      opacity: 0;
      transform: translateX(-24px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes enter-play {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .enter-journal,
    .enter-play {
      animation: none;
    }
  }

  /* Reveal after an automatic pause. Opacity and an 8px blur only. */
  .play.revealing .board {
    visibility: visible !important;
    animation: rv-board var(--resume-ms) var(--resume-ease) both;
  }

  .play.revealing .chrome-dim {
    opacity: 1 !important;
    transition: opacity var(--resume-ms) var(--resume-ease);
  }

  /* Short absences restore interactive chrome without a trailing fade. */
  .play.short-return .chrome-dim {
    transition: none;
  }

  /* 120ms is a fifth of the 600ms ease-out, which is about 49% visible. */
  .play.revealing.reveal-mid .board,
  .play.revealing.reveal-mid :global(.paused-cover) {
    animation-play-state: paused;
    animation-delay: calc(var(--resume-ms) * -0.2);
  }

  .play.revealing.reveal-mid .chrome-dim {
    opacity: 0.693 !important;
    transition: none;
  }

  @keyframes rv-board {
    from {
      opacity: 0;
      filter: blur(var(--resume-blur));
    }
    to {
      opacity: 1;
      filter: blur(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .play.revealing .board,
    .play.revealing :global(.paused-cover) {
      animation: none;
    }
    .play.revealing :global(.paused-cover) {
      opacity: 0;
    }
    .success-message,
    .success-card,
    .chrome-dim,
    .play.revealing .chrome-dim {
      animation: none;
      transition: none;
    }
  }
</style>
