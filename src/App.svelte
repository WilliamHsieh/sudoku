<script>
  /* global __SUDOKU_BUILD__ */
  import { installAutoUpdate, createUpdateAction, reloadForUpdate } from "./auto-update-browser.js";
  import { paintBoard, discardPaint, beginSpaceHold, endSpaceHold } from "./paint-actions.js";
  import "./autofill.css";
  import {
    animateAutofill,
    autofillDelay,
    clearAutofill,
    resetAutofill,
    syncAutofill,
  } from "./autofill.svelte.js";
  import SavedSolve from "./bank/SavedSolve.svelte";
  import ReplayConfirm from "./ReplayConfirm.svelte";
  import UnlockOverlay from "./bank/UnlockOverlay.svelte";
  import BankSolved from "./bank/BankSolved.svelte";
  import { bankSolvedModel, customSolvedModel } from "./bank/solved-model.js";

  import "./solved.css";
  import UpdateNotice from "./UpdateNotice.svelte";
  import Cell from "./Cell.svelte";
  import PlayHeader from "./PlayHeader.svelte";
  import BankPages from "./bank/BankPages.svelte";
  import { createBankUI } from "./bank/ui-session.svelte.js";
  import { modeName, levelName } from "./bank/ui-copy.js";
  import CustomPuzzleEditor from "./custom/CustomPuzzleEditor.svelte";
  import CustomDraftHeader from "./custom/CustomDraftHeader.svelte";
  import { parsePuzzleInput } from "./custom/puzzle-input.js";
  import Tools from "./Tools.svelte";
  import Keypad from "./Keypad.svelte";
  import { fitKeypad } from "./fit-keypad.js";
  import { get } from "svelte/store";
  import { done, timer } from "./store";
  import { game } from "./game/game.svelte.js";

  import { ring } from "./ring.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { installIosZoomGuards } from "./ios-zoom.js";
  import { installShiftHover, isShiftAim, releaseShiftHover } from "./shift-hover.svelte.js";
  import { digitFromCode } from "./game/key-gesture.js";
  import {
    clearHideTimer,
    clearToast,
    showToast,
    eraseCell,
    lockDigit,
    lockTap,
    placedCount,
    resetKeypad,
    revealCellDigit,
    setLastKeyPress,
    showDigit,
    syncHighlightAfterEdit,
    toggleDigitLock,
    unlockKeepShown,
  } from "./keypad-actions.js";
  import { hintModel } from "./keypad-copy.js";
  import { playUi, RESUME_REVEAL_MS, RESUME_EASE, RESUME_BLUR_PX } from "./play/session.svelte.js";
  import { applyShot } from "./play/shot.js";
  import { applyKeypadShot } from "./play/keypad-shot.js";
  import { PAUSE_ON_WINDOW_BLUR } from "./play/background-policy.js";
  import PausedCover from "./PausedCover.svelte";
  import OptionsSheet from "./OptionsSheet.svelte";
  import HintPanel from "./hints/HintPanel.svelte";
  import { createHintSession } from "./hints/session.svelte.js";
  import { createHintFocus } from "./hints/focus.svelte.js";
  import { hintFrameFor } from "./hints/layout.js";
  import { flushSync, onDestroy, onMount, tick, untrack } from "svelte";

  /** @type {{hintProvider?: import('./hints/hint.js').HintProvider | null}} */
  let { hintProvider = null } = $props();
  // Bind once at mount. Production injects the proof-checked Worker; isolated
  // previews can still supply fixtures without including them in the bundle.
  /** @type {{cancelFeedback: () => void} | undefined} */
  let keypad = $state();
  const hintFocus = createHintFocus();
  const hints = createHintSession({
    game,
    provider: untrack(() => hintProvider),
    beforeOpen() {
      keypad?.cancelFeedback();
      ring.clearFeedback();
      resetKeypad();
      releaseShiftHover();
      clearAutofill();
      padUi.blocked = [];
      padUi.undoTargets = [];
      hintFocus.clear();
    },
  });
  // Ordinary playing feedback is kept separate from the proof being read.
  const isolateHint = $derived(
    hints.status === "searching" || hints.status === "ready" || hints.status === "applied"
  );
  onDestroy(() => hintFocus.clear());
  $effect(() => {
    void hints.status;
    void hints.stage;
    hintFocus.clear();
  });
  /** @type {{mode: 'docked'|'side', left: number, top: number, width: number, maxHeight: number} | null} */
  let hintFrame = $state(null);

  function measureHint() {
    const board = wrapEl?.querySelector(".board");
    const controls = playViewport?.querySelector(".mobile-chrome");
    if (!board || !controls || !hints.isOpen) return;
    const rect = board.getBoundingClientRect();
    const chrome = controls.getBoundingClientRect();
    // Preserve the current board and controls layout. The hint temporarily
    // occupies the existing controls area, on both wide and stacked layouts.
    const next = hintFrameFor(rect, chrome, { width: innerWidth, height: innerHeight });
    if (JSON.stringify(next) !== JSON.stringify(hintFrame)) hintFrame = next;
  }

  async function closeHint() {
    hints.close();
    hintFrame = null;
    await tick();
    document.getElementById("hint-trigger")?.focus({ preventScroll: true });
  }

  function openHint() {
    if (game.notesMode === "manual") return;
    if (hints.isOpen) {
      void closeHint();
      return;
    }
    void hints.open();
    measureHint();
  }

  $effect(() => {
    hints.reconcile(game.state);
  });
  $effect(() => {
    if (game.notesMode === "manual" || showPages || playUi.paused || playUi.modal) {
      hints.close();
      hintFrame = null;
    }
  });
  $effect(() => {
    if (!wrapEl || !hints.isOpen) return;
    const observer = new ResizeObserver(measureHint);
    observer.observe(wrapEl);
    void Promise.all(
      document
        .querySelector(".play")
        ?.getAnimations()
        .map((a) => a.finished) ?? []
    ).then(measureHint, () => {});
    window.addEventListener("resize", measureHint);
    window.addEventListener("scroll", measureHint, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureHint);
      window.removeEventListener("scroll", measureHint);
    };
  });

  $effect(() => {
    if (game.bankMeta) {
      const paused = playUi.paused;
      untrack(() => game.bankLifecycle(paused ? "pause" : "resume"));
    }
  });

  game.setOnActivity(() => playUi.noteActivity());
  game.setOnLoad(() => {
    playUi.resetForLoad();
    resetKeypad();
    resetAutofill();
    solvedScreen = false;
    autoFinishing = false;
    clearTimeout(solvedDelay);
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
    if (game.solved && !showPages) return;
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

  const bank = createBankUI();
  let route = $state("home");
  let returnRoute = "home";
  let chosenLevel = $state(/** @type {import('./bank/types.js').Level} */ (3));
  let busy = $state(false);
  let savedItem = $state.raw(
    /** @type {ReturnType<typeof bank.list>['items'][number] | null} */ (null)
  );
  let savedAttempt = $state.raw(/** @type {import('./bank/types.js').Attempt | null} */ (null));
  let savedCustom = $state.raw(/** @type {(typeof bank.customItems)[number] | null} */ (null));
  const customItem = $derived(
    game.bankMeta
      ? null
      : bank.customItems.find((i) => i.puzzle.digits === game.state.givens.join(""))
  );
  const savedReplay = $derived(
    savedCustom
      ? (bank.customItems.find((i) => i.puzzle.digits === savedCustom.puzzle.digits)?.active ??
          null)
      : savedItem
        ? (bank.attempts.find(
            (a) =>
              a.puzzle.digits === savedItem.puzzle.digits &&
              ["in_progress", "paused"].includes(a.outcome)
          ) ?? null)
        : null
  );
  async function navigate(next) {
    try {
      game.select(-1);
      playUi.pause();
      game.bankLifecycle("pause");
      await game.flushProgress(true);
      await bank.refresh();
      route = next;
      showPages = true;
      await tick();
      document.querySelector(".bank-pages h1")?.setAttribute("tabindex", "-1");
      const heading = document.querySelector(".bank-pages h1");
      if (heading instanceof HTMLElement) heading.focus();
    } catch (e) {
      showToast(e.message, false, 3500);
    }
  }
  function clearCustomLink() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("q")) return;
    url.searchParams.delete("q");
    history.replaceState(history.state, "", url);
  }
  async function startBank(mode, level) {
    if (busy) return;
    busy = true;
    try {
      game.bankLifecycle("pause");
      await game.flushProgress(true);
      const selection = await bank.choose(mode, level);
      if (selection.status !== "selected") {
        showToast("No new puzzles in this range. Choose a solved puzzle to replay.", false, 3500);
        return;
      }
      if (!(await game.startBank(bank.meta(selection))))
        throw new Error("Could not start this puzzle.");
      clearCustomLink();
      returnRoute = showPages ? route : returnRoute;
      handleLoadPuzzle();
    } catch (e) {
      showToast(e.message, false, 3500);
    } finally {
      busy = false;
    }
  }
  async function resumeBank(id) {
    if (busy) return;
    busy = true;
    try {
      game.bankLifecycle("pause");
      await game.flushProgress(true);
      const slot = bank.slots.find((s) => s.attemptId === id);
      const current = id === game.bankMeta?.attemptId || id === game.customAttemptId;
      const resumed =
        current && !game.solved
          ? (playUi.resume(), true)
          : slot?.mode === "custom"
            ? await game.startCustom("", id)
            : await game.startBank(null, id);
      if (!resumed) throw new Error("Could not resume this game.");
      if (slot?.mode !== "custom") clearCustomLink();
      returnRoute = showPages ? route : returnRoute;
      handleLoadPuzzle();
      await tick();
      focusId("time-control");
    } catch (e) {
      showToast(e.message, false, 3500);
    } finally {
      busy = false;
    }
  }
  function openLevel(level) {
    chosenLevel = level;
    void navigate("list");
  }
  async function openPuzzle(item) {
    if (route === "custom") {
      if (item.state === "in_progress") await resumeBank(item.active.attemptId);
      else viewCustomSolve(item);
      return;
    }
    if (item.state === "in_progress") {
      const attempt = bank.attempts.find(
        (a) =>
          a.puzzle.digits === item.puzzle.digits && ["in_progress", "paused"].includes(a.outcome)
      );
      if (attempt) await resumeBank(attempt.attemptId);
      return;
    }
    if (item.state !== "unsolved") {
      savedCustom = null;
      savedItem = item;
      savedAttempt = bank.attempts
        .filter(
          (a) =>
            a.puzzle.digits === item.puzzle.digits &&
            ["independent_complete", "hinted_complete"].includes(a.outcome)
        )
        .sort((a, b) => a.endedAt - b.endedAt || a.attemptId.localeCompare(b.attemptId))[0];
      if (!savedAttempt) return;
      game.viewBankSolve(item.puzzle.digits, Math.floor(savedAttempt.effectiveMs / 1000));
      returnRoute = "list";
      handleLoadPuzzle();
      return;
    }
    if (busy) return;
    busy = true;
    try {
      const selection = await bank.choose("manual", chosenLevel, item.puzzle);
      if (!(await game.startBank(bank.meta(selection))))
        throw new Error("Could not start this puzzle.");
      clearCustomLink();
      returnRoute = "list";
      handleLoadPuzzle();
    } catch (e) {
      showToast(e.message, false, 3500);
    } finally {
      busy = false;
    }
  }
  let showPages = $state(true);
  const customParams = new URLSearchParams(window.location.search);
  const incomingPuzzle = customParams.has("q");
  let customOpen = $state(incomingPuzzle);
  $effect(() => {
    document.documentElement.lang = showPages && !customOpen ? "zh-Hant" : "en";
  });
  let customReady = $state(false);
  let customPreview = $state(false);
  let customRaw = $state("0".repeat(81));
  let customIncoming = $state(
    /** @type {string | null} */ (incomingPuzzle ? window.location.href : null)
  );
  async function startDaily(puzzle, label) {
    try {
      if (await game.startCustom(puzzle, undefined, label)) {
        returnRoute = "daily";
        handleLoadPuzzle();
      }
    } catch (e) {
      showToast(e.message, false, 3500);
    }
  }
  function viewCustomSolve(item) {
    savedItem = null;
    savedCustom = item;
    game.viewBankSolve(item.puzzle.digits, item.solves[0].elapsed);
    returnRoute = "custom";
    handleLoadPuzzle();
  }
  /** A board played before reopens its record instead of starting a duplicate. */
  async function openKnownCustom(puzzle) {
    if (!bank.loaded) await bank.refresh();
    const item = bank.customItems.find((i) => i.puzzle.digits === puzzle);
    if (!item) return false;
    const solved = item.state === "solved";
    if (solved) viewCustomSolve(item);
    else await resumeBank(item.active.attemptId);
    await tick();
    showToast(solved ? "這題之前解過" : "這題之前玩過，已幫你接著玩", false, 2600);
    return true;
  }
  async function startCustomPuzzle() {
    if (!customReady) return;
    const parsed = parsePuzzleInput(customRaw);
    if (!parsed.ok) return;
    try {
      if (!(await openKnownCustom(parsed.puzzle))) {
        if (!(await game.startCustom(parsed.puzzle))) return;
        handleLoadPuzzle();
        void bank.refresh().catch(() => {});
      }
    } catch (e) {
      showToast(e.message, false, 3500);
      return;
    }
    returnRoute = route;
    const url = new URL(window.location.href);
    if (url.searchParams.get("q") !== parsed.puzzle) {
      url.searchParams.set("q", parsed.puzzle);
      history.replaceState(history.state, "", url);
    }
    customOpen = false;
    customPreview = false;
  }
  let viewMotion = $state(false);
  let isNarrow = $state(typeof window !== "undefined" && window.matchMedia(NARROW_MQ).matches);
  /** Cover stays mounted through the fade-out. */
  let showCover = $state(false);
  let coverLeaving = $state(false);
  /** Phone board stays painted until the cover is opaque, then hides. */
  let concealBoard = $state(false);
  let automaticCover = $state(false);
  /** Backgrounding must never wait for the manual cover entrance. */
  let backgroundCover = $state(false);
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
      concealBoard = playUi.resumePhase !== "reveal" && (backgroundCover || reduceMotion());
      return;
    }
    concealBoard = false;
    backgroundCover = false;
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
  let playViewport = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let pagesViewport = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let wrapEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let ringEl = $state(/** @type {HTMLDivElement | undefined} */ (undefined));
  let replayConfirm = $state(false);
  async function cancelReplay() {
    replayConfirm = false;
    await tick();
    document.getElementById("sv-replay")?.focus({ preventScroll: true });
  }
  async function confirmReplay() {
    if (!(savedItem || savedCustom) || busy) return;
    busy = true;
    try {
      if (savedCustom) {
        if (!(await game.startCustom(savedCustom.puzzle.digits, undefined, savedCustom.label)))
          throw new Error("Could not start replay.");
      } else {
        const selection = await bank.choose("manual", chosenLevel, savedItem.puzzle);
        if (!(await game.startBank({ ...bank.meta(selection), replay: true })))
          throw new Error("Could not start replay.");
        clearCustomLink();
      }
      replayConfirm = false;
      handleLoadPuzzle();
      await tick();
      focusId("time-control");
    } catch (e) {
      showToast(e.message, false, 3500);
    } finally {
      busy = false;
    }
  }
  function resumeReplay() {
    if (savedReplay) void resumeBank(savedReplay.attemptId);
  }
  let solvedScreen = $state(false);
  let unlockedLevel = $state(/** @type {number | null} */ (null));
  async function closeUnlock() {
    unlockedLevel = null;
    await tick();
    focusId("sv-h");
  }
  let autoFinishing = false;
  let controlsGone = $state(false);
  let solveOrigin = $state(80);
  let boardSize = $state(650);
  let spread = $state({ x: 0, y: 0, radius: 0 });
  let resultModel = $state(
    /** @type {ReturnType<typeof bankSolvedModel> | ReturnType<typeof customSolvedModel> | null} */ (
      null
    )
  );
  $effect(() => {
    const element = wrapEl;
    if (!element) return;
    const observer = new ResizeObserver(() => (boardSize = element.getBoundingClientRect().width));
    observer.observe(element);
    return () => observer.disconnect();
  });
  async function showSolved() {
    const rect = wrapEl?.getBoundingClientRect();
    boardSize = rect?.width ?? 650;
    const cell = wrapEl?.querySelector(`[data-i="${solveOrigin}"]`)?.getBoundingClientRect();
    const x = cell && rect ? cell.x + cell.width / 2 - rect.x : boardSize / 2;
    const y = cell && rect ? cell.y + cell.height / 2 - rect.y : boardSize / 2;
    spread = {
      x,
      y,
      radius: Math.hypot(Math.max(x, boardSize - x), Math.max(y, boardSize - y)) + 130,
    };
    game.select(-1);
    resetKeypad();
    releaseShiftHover();
    try {
      if (game.bankMeta) {
        const id = game.bankMeta.attemptId;
        const previous = bank.unlock;
        await game.flushProgress(true);
        await bank.refresh();
        resultModel = bankSolvedModel(bank.attempts, id, previous);
        await bank.checkpoint();
        unlockedLevel = resultModel.result.justUnlockedLevel;
      } else {
        await game.flushProgress(true);
        await bank.refresh();
        const before = customItem?.solves.filter((s) => s.attemptId !== game.customAttemptId);
        resultModel = customSolvedModel(
          get(timer),
          before?.length ? get(timer) - before.at(-1).elapsed : null
        );
      }
    } catch (e) {
      showToast(e.message, false, 3500);
      return;
    }
    solvedScreen = true;
  }
  $effect(() => {
    if (!$done) {
      solvedScreen = false;
      controlsGone = false;
      return;
    }
    if (game.journalView) {
      untrack(() => {
        game.select(-1);
        resetKeypad();
        releaseShiftHover();
      });
      solvedScreen = true;
      controlsGone = true;
      return;
    }
    if (autoFinishing) return;
    solveOrigin = untrack(() => game.lastPlaced);
    solvedDelay = setTimeout(showSolved, 180);
    return () => clearTimeout(solvedDelay);
  });
  $effect(() => {
    if (!solvedScreen) return;
    const id = setTimeout(() => (controlsGone = true), playUi.reduced ? 120 : 260);
    return () => clearTimeout(id);
  });
  function nextSolved() {
    if (!resultModel) return;
    if (!resultModel.result) void navigate("custom");
    else void startBank(resultModel.nextMode, resultModel.nextLevel);
  }
  async function saveFeeling(feedback) {
    if (!resultModel?.attemptId) return false;
    try {
      await bank.feedback(feedback, resultModel.attemptId);
      return true;
    } catch (e) {
      showToast(e.message, false, 3500);
      return false;
    }
  }
  const resumeTarget = $derived(
    bank.slots.find((slot) => slot.attemptId !== resultModel?.attemptId)
  );
  let solvedDelay = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
  const singlesCount = $derived(game.singles.length);

  function fillAvailable() {
    return (
      game.notesMode === "auto" &&
      !showPages &&
      !playUi.paused &&
      !playUi.modal &&
      !$done &&
      !document.querySelector("dialog[open], [popover]:popover-open:not([inert])")
    );
  }

  function fillSingles() {
    if (!fillAvailable()) return;
    clearToast();
    flushSync(clearAutofill);
    clearTimeout(solvedDelay);
    autoFinishing = true;
    const result = game.fillSingles();
    animateAutofill(result, game.state.answers, playUi.reduced);
    const n = result.placed.length;
    let message = `Filled ${n} cells.`;
    if (result.skipped.length)
      message = `Filled ${n} cells · ${result.skipped.length} skipped, they need the same digit.`;
    else if (!n) message = "No cells with a single candidate.";
    else if (n <= 4)
      message +=
        " " +
        result.placed.map(({ i, d }) => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1} ${d}`).join(", ");
    padUi.announcement = message;
    padUi.commitId++;
    if (!n && !result.skipped.length) showToast("No single candidates right now", false, 1800);
    const lastDelay = autofillDelay(n - 1, n, playUi.reduced);
    if (game.solved)
      solvedDelay = setTimeout(() => {
        solveOrigin = result.placed.at(-1)?.i ?? 80;
        showSolved();
      }, lastDelay + 520);
    else autoFinishing = false;
  }

  /** Only the board, keypad and body reserve plain Tab in Auto mode. */
  function tryAutofill(e) {
    if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || !fillAvailable())
      return false;
    const active = document.activeElement;
    if (
      active !== document.body &&
      !(active instanceof Element && active.closest(".board, #keypad"))
    )
      return false;
    e.preventDefault();
    fillSingles();
    return true;
  }

  $effect(() => {
    const answers = game.state.answers;
    untrack(() => syncAutofill(answers));
  });

  function handleKeydown(e) {
    const cmd = e.ctrlKey || e.metaKey;
    // Only these chords are undo/redo. Ctrl/Alt/Meta+digit follows master and
    // still enters the digit.
    if (e.ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      if (isNarrow) game.redo();
      else ring.redo({ immediate: true, syncHighlight: true });
      return;
    }
    if (cmd && e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      if (isNarrow) game.redo();
      else ring.redo({ immediate: true, syncHighlight: true });
      return;
    }
    if (cmd && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (isNarrow) game.undo();
      else ring.undo({ immediate: true, syncHighlight: true });
      return;
    }

    if (
      !isNarrow &&
      e.key >= "1" &&
      e.key <= "9" &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      (game.selected < 0 || !game.editable(game.selected))
    ) {
      clearHideTimer();
      setLastKeyPress({ d: 0, t: -Infinity });
      showDigit(Number(e.key));
      e.preventDefault();
      return;
    }
    if (game.selected == -1) return;
    const id = game.selected;

    if (!isNarrow && ["Backspace", "Delete", "0"].includes(e.key) && game.editable(id)) {
      eraseCell(id);
    } else if (e.key >= "0" && e.key <= "9" && game.editable(id)) {
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
    if (isNarrow) {
      if (padUi.locked === d) unlockKeepShown();
      else lockDigit(d);
      releaseShiftHover();
    } else toggleDigitLock(d);
    return true;
  }

  /** Desktop Enter fills the locked answer; phone keeps its original note toggle. */
  function tryLockedInput(e) {
    if (e.key !== " " && e.key !== "Enter") return false;
    if (
      e.target instanceof Element &&
      e.target.closest("button, a, input, textarea, select, summary")
    ) {
      return false;
    }
    if (!isNarrow && e.key === " ") {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.repeat && !padUi.spaceHold)) return false;
      if (!beginSpaceHold()) return false;
      e.preventDefault();
      return true;
    }
    if (!padUi.locked) return false;
    e.preventDefault();
    if (game.selected >= 0) {
      if (e.key === "Enter" && !isNarrow) game.fill(game.selected, padUi.locked);
      else lockTap(game.selected);
    }
    return true;
  }

  function handleGlobalKeydown(e) {
    if (e.key !== " " && e.key !== "Escape") endSpaceHold(true);
    if (showPages) return;
    if (playUi.modal || replayConfirm || unlockedLevel) return;
    // Every game binding below is off once complete: digits (including modified
    // digits), arrows, Backspace/Delete/0, undo/redo (Ctrl/Cmd Z, Shift Z, Ctrl Y),
    // Tab autofill, Shift digit lock, Space/Enter locked input, Escape and P.
    if (game.solved && !showPages) {
      if (
        solvedScreen &&
        !game.journalView &&
        e.key === "Enter" &&
        !e.repeat &&
        (document.activeElement === document.body || document.activeElement?.id === "sv-h")
      ) {
        e.preventDefault();
        nextSolved();
      }
      return;
    }
    if (
      !isNarrow &&
      e.target instanceof Element &&
      e.target.closest("input, textarea, select, [contenteditable]")
    )
      return;
    if (hints.isOpen && e.key === "Escape") {
      e.preventDefault();
      void closeHint();
      return;
    }
    if (e.target instanceof Element && e.target.closest(".hint-panel")) return;
    if (hints.isOpen && e.key === "Tab") return;
    const plainP =
      (e.key === "p" || e.key === "P") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (plainP) {
      e.preventDefault();
      onPauseClick();
      return;
    }
    if (playUi.paused) return;
    if (showPages && !isNarrow) return;
    if (e.key === "Escape") {
      if (showPages) return;
      if (padUi.spaceHold) {
        e.preventDefault();
        endSpaceHold(true);
        return;
      }
      if (discardPaint()) {
        e.preventDefault();
        return;
      }
      if (padUi.locked) {
        e.preventDefault();
        unlockKeepShown();
        return;
      }
      return;
    }
    if (tryAutofill(e) || tryShiftLock(e) || tryLockedInput(e)) return;
    handleKeydown(e);
  }

  /** Board/keypad pointer input releases the header's keyboard focus. */
  function releaseViewFocus(e) {
    if (!(e.target instanceof Element) || !e.target.closest(".board, #keypad")) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".tp, .dbtn, .notes-mode")) active.blur();
  }

  async function leavePlay() {
    await navigate(returnRoute);
  }

  async function openCustomPuzzle() {
    customOpen = true;
    await navigate(route === "custom" ? route : "home");
    resumeStatus = "Custom puzzle. Enter the given numbers or paste a puzzle.";
    const cell = document.querySelector(".custom-editor .input-cell[tabindex='0']");
    if (cell instanceof HTMLElement) cell.focus({ preventScroll: true });
  }

  async function closeCustomPuzzle() {
    if (customPreview) {
      customPreview = false;
      return;
    }
    customOpen = false;
    await tick();
    const entry = [...document.querySelectorAll(".custom-entry")].find(
      (node) => node instanceof HTMLElement && node.getClientRects().length > 0
    );
    if (entry instanceof HTMLElement) entry.focus({ preventScroll: true });
  }

  function handleLoadPuzzle() {
    showCover = false;
    coverLeaving = false;
    concealBoard = false;
    backgroundCover = false;
    playUi.start();
    viewMotion = true;
    showPages = false;
  }

  const UPDATE_COPY = "New version ready. Update available.";
  let updateNotice = $state(false);
  let updateVersion = "";
  let noticeHadFocus = false;
  let updating = $state(false);
  let updateError = $state("");
  // Once visible, keep it visible through later resume animations. A newly
  // discovered version waits for both the hold and the 600ms reveal to finish.
  let noticeRevealed = $state(false);
  const noticeActive = $derived(updateNotice && (noticeRevealed || playUi.resumePhase === "idle"));
  const fillChip = $derived(
    isNarrow &&
      game.notesMode === "auto" &&
      singlesCount > 0 &&
      !noticeActive &&
      !padUi.locked &&
      !playUi.paused
  );
  $effect(() => {
    if (noticeActive) noticeRevealed = true;
  });

  function restoreNoticeFocus() {
    if (!document.activeElement?.closest(".update-notice")) return;
    focusAfterNotice();
  }

  function focusAfterNotice() {
    if (showPages) {
      const heading = document.querySelector(".bank-pages h1");
      if (heading instanceof HTMLElement) {
        heading.tabIndex = -1;
        heading.focus();
      }
    } else if (game.solved) focusId("sv-h");
    else focusMore();
  }

  function dismissUpdate() {
    restoreNoticeFocus();
    updateNotice = false;
    noticeRevealed = false;
  }

  const updateAction = createUpdateAction({
    onError: (message) => {
      updateError = message;
    },
    setUpdating: (value) => {
      updating = value;
    },
    flush: () => game.flushProgress(true),
    reload: () => reloadForUpdate(updateVersion),
  });

  function updateNow() {
    restoreNoticeFocus();
    updateError = "";
    updateAction.run();
  }

  onMount(() => {
    void bank.init();
    window.addEventListener("pointerdown", releaseViewFocus, true);
    const mq = window.matchMedia(NARROW_MQ);
    isNarrow = mq.matches;
    const onNarrow = () => {
      endSpaceHold(true);
      const hadNoticeFocus = noticeHadFocus;
      isNarrow = mq.matches;
      if (hadNoticeFocus) void tick().then(focusAfterNotice);
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
    /** First departure signal; later hidden/pagehide events must not shorten the absence. */
    let hiddenAt = /** @type {number | null} */ (null);
    const isHidden = () => document.hidden || document.visibilityState === "hidden";
    const onAway = (event) => {
      const recordDeparture = () => {
        if (event?.type === "pagehide") game.bankLifecycle("close");
        else if (event?.type === "visibilitychange" && isHidden()) game.bankLifecycle("background");
      };
      hints.close();
      hintFrame = null;
      if (game.replaying) game.flushProgress();
      if (showPages || game.solved) {
        // Clear #58's view/entry announcement without pausing these views.
        resumeStatus = "";
        recordDeparture();
        return;
      }
      hiddenAt ??= Date.now();
      let newlyPaused = false;
      flushSync(() => {
        backgroundCover = true;
        resumeStatus = "";
        newlyPaused = playUi.noteHidden();
      });
      // Resolve the opaque cover's style now, before the browser can suspend us.
      // This prepares rendering; it cannot force the OS to capture a new frame.
      const cover = wrapEl?.querySelector(".paused-cover");
      if (cover) getComputedStyle(cover).opacity;
      if (newlyPaused) void focusAfterPause(true);
      // noteHidden folds the timer's last running segment before recording time.
      recordDeparture();
    };
    const onReturn = () => {
      if (isHidden() || hiddenAt === null) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      const silent = showPages;
      let result;
      flushSync(() => {
        result = playUi.noteVisible(away, { silent });
        shortReturn = result === "quiet" && !silent;
      });
      if (result === "announced") void announceResumed();
      else if (result === "quiet" && !silent) void focusAfterPause(false);
    };
    const onVis = (event) => (isHidden() ? onAway(event) : onReturn());
    /** @param {FocusEvent} event */
    const onWindowBlur = (event) => {
      // Native dialog Tab wrapping can briefly focus browser chrome. While a
      // dialog is open, use the explicit lifecycle signals for backgrounding.
      if (PAUSE_ON_WINDOW_BLUR && event.target === window && (!playUi.modal || isHidden()))
        onAway(event);
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onReturn);
    window.addEventListener("pagehide", onAway);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("freeze", onAway);
    document.addEventListener("resume", onReturn);
    document.addEventListener("visibilitychange", onVis);
    if (shotParams.has("freeze")) document.documentElement.classList.add("kp-freeze");
    revealMid = shotParams.get("reveal") === "mid";
    const shot = shotParams.get("shot");
    if (shot) {
      applyShot(game, shot === "manual");
      showPages = false;
    }
    const kp = shotParams.get("kp");
    if (kp) {
      applyKeypadShot(game, kp);
      showPages = false;
    }
    const stopUpdates =
      typeof __SUDOKU_BUILD__ === "undefined"
        ? () => {}
        : installAutoUpdate({
            current: __SUDOKU_BUILD__,
            base: import.meta.env.BASE_URL,
            notify: (version) => {
              updateVersion = version;
              updateNotice = true;
            },
          });
    return () => {
      stopUpdates();
      clearTimeout(solvedDelay);
      resetAutofill();
      updateAction.stop();
      window.removeEventListener("pointerdown", releaseViewFocus, true);
      mq.removeEventListener("change", onNarrow);
      reduceMq.removeEventListener("change", onReduce);
      hints.close();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pagehide", onAway);
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("freeze", onAway);
      document.removeEventListener("resume", onReturn);
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
      desktop: !isNarrow,
      held: padUi.spaceHold?.engaged ? padUi.spaceHold.d : 0,
    });
  });

  $effect(() => {
    if (playUi.paused || playUi.modal) {
      endSpaceHold(true);
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
    if (showPages) return;
    playUi.start();
  });

  $effect(() => {
    if (showPages) return;
    if (wrapEl && ringEl) ring.bind(wrapEl, ringEl);
    const mobile = window.matchMedia("(max-width: 599px)").matches;
    const stopZoom = mobile ? installIosZoomGuards() : () => {};
    return () => {
      stopZoom();
      ring.destroy();
    };
  });
</script>

<svelte:window
  onkeydown={handleGlobalKeydown}
  onkeyup={(event) => {
    if (event.key === " " && padUi.spaceHold) {
      event.preventDefault();
      endSpaceHold();
    }
  }}
  onfocusin={(event) => {
    noticeHadFocus = event.target instanceof Element && !!event.target.closest(".update-notice");
  }}
/>

<svelte:head>
  <title>Sudoku</title>
</svelte:head>

<!-- Cover the PWA top blur without changing the safe-area padding. -->
<div class="top-strip" aria-hidden="true"></div>

<main
  inert={!!unlockedLevel}
  class:on-pages={showPages && !customOpen}
  class:bank-home={showPages && !customOpen}
  class:background-hiding={backgroundCover && playUi.paused && playUi.resumePhase !== "reveal"}
>
  <p id="resume-status" class="sr-only" aria-live="polite">{resumeStatus}</p>
  {#if customOpen && showPages}
    <CustomDraftHeader preview={customPreview} onback={closeCustomPuzzle} />
  {:else if !showPages}
    <PlayHeader
      title={game.journalView && savedItem
        ? `L${chosenLevel} · 第 ${savedItem.index} 題`
        : (customItem?.title ?? "")}
      subtitle={game.journalView && savedItem ? levelName(chosenLevel) : ""}
      inert={replayConfirm}
      narrow={isNarrow}
      ondate={() => leavePlay()}
      ontime={onPauseClick}
      onhint={openHint}
      hintOpen={hints.isOpen}
    />
  {/if}

  {#if showPages}
    <div
      bind:this={pagesViewport}
      class="pages-view"
      class:custom-editor-host={customOpen}
      class:enter-pages={viewMotion && !playUi.reduced}
    >
      <CustomPuzzleEditor
        onstart={startCustomPuzzle}
        bind:open={customOpen}
        bind:canStart={customReady}
        bind:preview={customPreview}
        bind:raw={customRaw}
        bind:incoming={customIncoming}
      >
        <BankPages
          {bank}
          {route}
          level={chosenLevel}
          onnavigate={navigate}
          onlevel={openLevel}
          onstart={startBank}
          onresume={resumeBank}
          oncustom={openCustomPuzzle}
          ondaily={startDaily}
          onpuzzle={openPuzzle}
        />
      </CustomPuzzleEditor>
    </div>
  {:else}
    <div
      inert={replayConfirm}
      use:fitKeypad
      bind:this={playViewport}
      class="play"
      class:solved-screen={solvedScreen}
      style:--sv-board-size={`${boardSize}px`}
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
            class:quiet={!isolateHint && padUi.quiet}
            class:shift-aim={!isolateHint && isShiftAim()}
            data-hint-isolated={isolateHint ? "true" : undefined}
            aria-hidden={playUi.paused ? "true" : undefined}
            inert={playUi.paused || game.solved}
            data-cue-phase={playUi.phase}
            data-notes-mode={game.notesMode}
          >
            {#each CELL_IDS as id (id)}
              <Cell
                cell_id={id}
                desktop={!isNarrow}
                hint={hints.evidence(id)}
                suppressHighlights={isolateHint}
                hintFocus={hints.isOpen && hintFocus.cell === id ? hintFocus.sequence : 0}
                reducedMotion={playUi.reduced}
              />
            {/each}
          </div>
          {#if solvedScreen && !game.journalView && !playUi.reduced}
            <div
              class="sv-ring"
              aria-hidden="true"
              style:--sv-x={`${spread.x}px`}
              style:--sv-y={`${spread.y}px`}
              style:--sv-rmax={`${spread.radius}px`}
            ></div>
          {/if}
          {#if showCover}
            <PausedCover
              showKey={!isNarrow}
              leaving={coverLeaving}
              immediate={backgroundCover}
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
            <p
              class="toast"
              class:af-toast={padUi.toast === "No single candidates right now"}
              role="status"
            >
              {padUi.toast}
            </p>
          {/if}
        </div>
      </div>
      <div
        class="mobile-chrome"
        class:sv-chrome={solvedScreen}
        class:hint-replaced={hints.isOpen}
        inert={hints.isOpen}
      >
        {#if game.journalView && savedCustom}<SavedSolve
            attempt={{
              endedAt: savedCustom.solves[0].updatedAt,
              effectiveMs: savedCustom.solves[0].elapsed * 1000,
            }}
            name={savedCustom.name}
            listName="Custom puzzles"
            delta={null}
            replay={savedReplay}
            onback={() => navigate("custom")}
            onresume={resumeReplay}
            onreplay={() => (replayConfirm = true)}
          />{:else if game.journalView && savedAttempt}<SavedSolve
            attempt={savedAttempt}
            name={`L${chosenLevel}`}
            listName={`L${chosenLevel} puzzles`}
            delta={bankSolvedModel(bank.attempts, savedAttempt.attemptId, bank.unlock).delta}
            replay={savedReplay}
            onback={() => navigate("list")}
            onresume={resumeReplay}
            onreplay={() => (replayConfirm = true)}
          />
        {:else if solvedScreen && resultModel}<BankSolved
            model={resultModel}
            reduced={playUi.reduced}
            onnext={nextSolved}
            onfeedback={saveFeeling}
            resumeLabel={resumeTarget
              ? `Resume · ${("label" in resumeTarget && resumeTarget.label) || modeName(resumeTarget.mode, resumeTarget.level)}`
              : ""}
            onresume={() => resumeTarget && resumeBank(resumeTarget.attemptId)}
          />{/if}
        {#if !controlsGone}
          <div
            class="game-controls"
            class:sv-leaving={solvedScreen}
            class:reduced={playUi.reduced}
            inert={game.solved}
          >
            {#if !isNarrow}
              <p class="controls-label">
                Numbers
                <span>
                  {#if padUi.locked}
                    Digit {padUi.locked} locked
                  {:else if game.selected >= 0}
                    Row {Math.floor(game.selected / 9) + 1} · Column {(game.selected % 9) + 1}
                  {:else}
                    Select a cell to get started
                  {/if}
                </span>
              </p>
            {/if}
            <div class="chrome-dim" class:dim={playUi.paused} inert={playUi.paused}>
              <Tools desktop={!isNarrow} />
              <div class="keypad-slot">
                <div class="keypad-scale"><Keypad bind:this={keypad} desktop={!isNarrow} /></div>
              </div>
            </div>
            {#if !isNarrow && game.notesMode === "auto"}
              <button
                type="button"
                class="af-desk"
                onmousedown={(event) => event.preventDefault()}
                aria-keyshortcuts="Tab"
                disabled={singlesCount === 0 || playUi.paused || !!playUi.modal || $done}
                onclick={fillSingles}
              >
                <svg class="af-ic" viewBox="0 0 24 24" aria-hidden="true"
                  ><path
                    d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"
                  /><path d="m16 19 2 2 4-4" /></svg
                >
                <span class="af-lbl"
                  >{singlesCount
                    ? `Fill ${singlesCount} single candidates`
                    : "No single candidates"}</span
                >
                <kbd class="af-kbd" aria-hidden="true">Tab</kbd>
              </button>
            {/if}
            <div
              class="hint-line"
              class:notice-active={isNarrow && noticeActive}
              class:af-active={fillChip}
              class:reduced={playUi.reduced}
            >
              <p
                class="pad-hint normal-hint"
                aria-live="polite"
                aria-hidden={isNarrow && (noticeActive || fillChip)}
              >
                {#if hint.kind === "plain"}
                  {hint.text}
                {:else}
                  <b>{hint.lead}</b>
                  {hint.rest}
                {/if}
              </p>
              {#if isNarrow && game.notesMode === "auto"}
                <div
                  class="af-chip inline"
                  class:active={fillChip}
                  class:reduced={playUi.reduced}
                  aria-hidden={!fillChip}
                  inert={!fillChip}
                >
                  <svg class="af-ic" viewBox="0 0 24 24" aria-hidden="true"
                    ><path
                      d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"
                    /><path d="m16 19 2 2 4-4" /></svg
                  >
                  <span class="af-msg">{singlesCount} cells have one candidate</span>
                  <button
                    type="button"
                    class="af-btn"
                    onmousedown={(event) => event.preventDefault()}
                    aria-label={`Fill ${singlesCount} cells that have one candidate`}
                    onclick={fillSingles}>Fill</button
                  >
                </div>
              {/if}
              {#if isNarrow && !game.solved}
                <UpdateNotice
                  active={noticeActive}
                  inline
                  reduced={playUi.reduced}
                  {updating}
                  onupdate={updateNow}
                  ondismiss={dismissUpdate}
                />
              {/if}
            </div>
            {#if !isNarrow}
              <details class="keyboard-help">
                <summary>Keyboard shortcuts</summary>
                <p class="keyboard-example">
                  Lock 4, then use the arrow keys to select a cell. Space adds or removes candidate
                  4; Enter fills 4 as the answer.
                </p>
                <dl>
                  <div>
                    <dt><kbd>1–9</kbd></dt>
                    <dd>Fill selected editable cell; otherwise highlight digit</dd>
                  </div>
                  <div>
                    <dt><kbd>↑ ↓ ← →</kbd></dt>
                    <dd>Move selection</dd>
                  </div>
                  <div>
                    <dt><kbd>Shift + 1–9</kbd></dt>
                    <dd>Lock digit</dd>
                  </div>
                  <div>
                    <dt><kbd>Shift + click</kbd></dt>
                    <dd>Lock digit on keypad</dd>
                  </div>
                  <div>
                    <dt>Right-click</dt>
                    <dd>Lock or unlock digit on keypad</dd>
                  </div>
                  <div>
                    <dt><kbd>Space</kbd></dt>
                    <dd>
                      Tap to toggle locked note; hold highlighted digit to click or drag candidates
                    </dd>
                  </div>
                  <div>
                    <dt><kbd>Enter</kbd></dt>
                    <dd>Fill locked digit as answer</dd>
                  </div>
                  <div>
                    <dt><kbd>Tab</kbd></dt>
                    <dd>Fill every cell with one candidate</dd>
                  </div>
                  <div>
                    <dt><kbd>⌫ / Del / 0</kbd></dt>
                    <dd>Erase answer or notes</dd>
                  </div>
                  <div>
                    <dt><kbd>Ctrl / ⌘ Z</kbd></dt>
                    <dd>Undo · add Shift to redo</dd>
                  </div>
                  <div>
                    <dt><kbd>Esc</kbd></dt>
                    <dd>Cancel stroke / unlock</dd>
                  </div>
                  <div>
                    <dt><kbd>P</kbd></dt>
                    <dd>Pause / resume</dd>
                  </div>
                </dl>
              </details>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <OptionsSheet
      canRestart={!game.solved && !game.replaying}
      viewport={playViewport}
      onclosed={focusMore}
      onrestart={() => {
        if (game.solved || game.replaying) return;
        game.restart();
        resetKeypad();
        resetAutofill();
      }}
    />
  {/if}
</main>

{#if showPages && padUi.toast}<div class="toast" role="status">{padUi.toast}</div>{/if}

<!-- Fixed surfaces live outside the animated play view, whose transform would
     otherwise turn the view into their positioning container. -->
{#if hints.isOpen && hintFrame}
  <div
    class="hint-surface"
    class:docked={hintFrame.mode === "docked"}
    style:left={`${hintFrame.left}px`}
    style:top={`${hintFrame.top}px`}
    style:--hint-max-height={`${hintFrame.maxHeight}px`}
    style:width={`${hintFrame.width}px`}
  >
    <HintPanel
      session={hints}
      onclose={() => void closeHint()}
      oncoordinate={(cell) => hintFocus.flash(cell)}
      docked={hintFrame.mode === "docked"}
    />
  </div>
{/if}

<!-- The polite live region stays mounted so screen readers announce the inserted notice. -->
{#if updateError}
  <div class="update-error" role="alert">
    {updateError} <a href={window.location.href}>Reload Sudoku</a>
  </div>
{/if}
<div class="update-live sr-only" aria-live="polite" aria-atomic="true">
  {noticeActive ? (updating ? "Updating…" : UPDATE_COPY) : ""}
</div>
<!-- App updates outlive the game controls, including their inert/fade interval. -->
{#if !isNarrow || showPages || game.solved}
  <UpdateNotice
    active={noticeActive}
    reduced={playUi.reduced}
    {updating}
    onupdate={updateNow}
    ondismiss={dismissUpdate}
  />
{/if}

{#if unlockedLevel}<UnlockOverlay level={unlockedLevel} onclose={closeUnlock} />{/if}

{#if replayConfirm}<ReplayConfirm
    bank
    unlockNote={!savedCustom}
    time={savedCustom
      ? savedCustom.solves[0].elapsed
      : savedAttempt
        ? Math.floor(savedAttempt.effectiveMs / 1000)
        : get(timer)}
    replayTime={null}
    oncancel={cancelReplay}
    onconfirm={confirmReplay}
  />{/if}

<style>
  main.bank-home {
    padding: 0;
    gap: 0;
  }
  main.bank-home .pages-view {
    overflow: auto;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .update-error {
    position: fixed;
    bottom: 76px;
    left: 16px;
    right: 16px;
    z-index: 1200;
    padding: 12px;
    background: var(--page);
    color: var(--ink);
    text-align: center;
    border: 1px solid var(--hair);
  }
  .update-live {
    position: fixed;
    top: 0;
    left: 0;
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

  .board-wrap {
    position: relative;
    max-width: 650px;
    width: 100%;
    margin: 0 auto 32px;
  }

  .board {
    position: relative;
    isolation: isolate;
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

  /* Paint continuous box lines above cell borders, selection and note cues.
     The outer border is protected by overflow clipping. Keep cell borders for
     layout and fractional-pixel coverage so digits and hit targets stay put. */
  .board::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
    background:
      linear-gradient(
        to right,
        transparent calc(100% / 3 - var(--line-box-w)),
        var(--line-box) 0 calc(100% / 3),
        transparent 0 calc(200% / 3 - var(--line-box-w)),
        var(--line-box) 0 calc(200% / 3),
        transparent 0
      ),
      linear-gradient(
        to bottom,
        transparent calc(100% / 3 - var(--line-box-w)),
        var(--line-box) 0 calc(100% / 3),
        transparent 0 calc(200% / 3 - var(--line-box-w)),
        var(--line-box) 0 calc(200% / 3),
        transparent 0
      );
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
  .hint-surface {
    position: fixed;
    z-index: 10;
    max-width: calc(100% - 16px);
  }
  .hint-surface.docked {
    bottom: max(8px, env(safe-area-inset-bottom));
  }

  .hint-replaced {
    visibility: hidden;
  }

  .controls-label {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .controls-label span {
    display: block;
    margin-top: 5px;
    color: var(--ui-soft);
    font-size: 12px;
    font-weight: 400;
  }
  .keyboard-help {
    border-top: 1px solid var(--hair);
    padding-top: 14px;
    font-size: 12px;
    color: var(--ui-soft);
  }
  .keyboard-help summary {
    width: fit-content;
    cursor: pointer;
    border-radius: 4px;
  }
  .keyboard-help summary:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 4px;
  }
  .keyboard-help dl {
    display: grid;
    gap: 10px;
    margin: 16px 0 0;
  }
  .keyboard-example {
    margin: 12px 0 0;
    line-height: 1.6;
  }
  .keyboard-help dl div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .keyboard-help dd {
    margin: 0;
    text-align: right;
  }
  kbd {
    color: var(--ui-ink);
    font: inherit;
    white-space: nowrap;
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

  .hint-line {
    display: grid;
    align-items: center;
    font-size: 12px;
    line-height: normal;
  }
  .normal-hint {
    grid-area: 1 / 1;
    opacity: 1;
    transition: opacity 260ms var(--ease-out) 180ms;
  }
  .notice-active .normal-hint {
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms var(--ease-out);
  }
  .reduced .normal-hint {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .normal-hint {
      transition: none;
    }
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

  @media (max-width: 768px) {
    main {
      padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    }

    .board-wrap {
      max-width: 100%;
      margin-bottom: 24px;
    }
  }

  /* Phone controls follow the board; wide screens put them alongside it. */
  @media (max-width: 599px) {
    /* Keep the board's 8px side inset while the keypad scales independently. */
    main {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
        max(16px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
    }

    main:has(> :global(.draft-header)) {
      gap: 0;
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

    /* fitKeypad gives the keypad space first; this square only shrinks once
       the keypad reaches its minimum scale. */
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

    .keypad-slot {
      flex: none;
      width: 100%;
      height: var(--keypad-height, 187.2px);
    }

    .keypad-scale {
      width: 100%;
      transform: scale(var(--keypad-scale, 0.9));
      transform-origin: top center;
    }

    .chrome-dim.dim {
      opacity: 0.4;
    }

    .play.board-concealed .board {
      visibility: hidden;
    }

    main.on-pages {
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
      gap: 16px;
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

    .mobile-chrome {
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: none;
      width: min(650px, 100%);
      min-width: 0;
    }
    .chrome-dim {
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: opacity var(--motion) var(--ease-out);
    }
    .chrome-dim.dim {
      opacity: 0.4;
    }
    .pad-hint {
      white-space: normal;
      line-height: 1.6;
      text-align: left;
    }
    .play.board-concealed .board {
      visibility: hidden;
    }
    .controls-label {
      display: none;
    }
    .keyboard-help dl {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 24px;
    }
  }

  @media (min-width: 600px) {
    .play {
      flex-direction: row;
      justify-content: center;
      align-items: flex-start;
      gap: 32px;
    }
    .board-slot {
      flex: 0 1 650px;
    }
    .mobile-chrome {
      width: 264px;
      padding-top: 8px;
      gap: 20px;
    }
    .controls-label {
      display: block;
    }
    .keyboard-help dl {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (min-width: 600px) {
    main {
      padding: 0;
    }
    main:not(.on-pages) > .play {
      padding: 0 16px 16px;
    }
  }
  .pages-view {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .enter-pages {
    animation: enter-pages 260ms var(--ease-out) both;
  }
  .pages-view.custom-editor-host {
    flex-direction: column;
    overflow-y: auto;
  }
  .enter-play {
    animation: enter-play 260ms var(--ease-out) both;
  }
  @keyframes enter-pages {
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
    .enter-pages,
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

  /* Background controls must reach the paused look in the cover's hide frame.
     Limit this to departure/hold so manual exits and automatic reveals keep their motion. */
  main.background-hiding .chrome-dim {
    opacity: 0.4;
    transition: none;
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
    .chrome-dim,
    .play.revealing .chrome-dim {
      animation: none;
      transition: none;
    }
  }
  .game-controls {
    display: flex;
    flex-direction: column;
    gap: inherit;
  }
  .sv-chrome {
    position: relative;
  }
  .sv-leaving {
    animation: sv-controls 160ms var(--ease-out) 100ms both;
  }
  .sv-leaving.reduced {
    animation: sv-controls 120ms linear both;
  }
  @keyframes sv-controls {
    to {
      opacity: 0;
      visibility: hidden;
    }
  }
  @media (max-width: 599px) {
    .sv-chrome {
      display: grid;
      gap: 0;
    }
    .sv-chrome > .game-controls {
      grid-area: 1/1;
    }
    .sv-chrome > :global(.sv-panel) {
      grid-area: 1/1;
    }
  }
</style>
