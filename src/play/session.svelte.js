// Pause, the options/confirm modals, and the single-candidate cue.
// The cue clock is pure (see cue-clock.js); this module is the reactive view of it.
import { timerRunning } from "../store.js";
import { createCueClock, idleMsFromSearch } from "./cue-clock.js";

const CUE_KEY = "sudoku-cue";
const TAP_FILL_KEY = "sudoku-tap-fill";

/** Cover stays put so the eye can land, then the board eases back in. */
export const RESUME_HOLD_MS = 250;
export const RESUME_REVEAL_MS = 600;
export const RESUME_EASE = "cubic-bezier(.33,1,.68,1)";
export const RESUME_BLUR_PX = 8;
/** Extra wait AFTER the full reveal deadline if CSS is cancelled or never finishes. */
const REVEAL_FALLBACK_MS = 1_000;
/** Hidden for less than this: resume with no hold, reveal, or announcement. */
export const RESUME_SHORT_MS = 1000;

/** @returns {boolean} */
function readCuePref() {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(CUE_KEY) !== "0";
}

/** @param {boolean} on */
function writeCuePref(on) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CUE_KEY, on ? "1" : "0");
}

/** Off unless the player turned legacy tap-to-fill on. @returns {boolean} */
function readTapFill() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(TAP_FILL_KEY) === "1";
}

/** @param {boolean} on */
function writeTapFill(on) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TAP_FILL_KEY, on ? "1" : "0");
}

/**
 * @param {string} search
 */
function idleFrom(search) {
  return idleMsFromSearch(search);
}

/**
 * @param {{ live?: boolean, idleMs?: number, now?: () => number }} [opts]
 */
export function createPlay(opts = {}) {
  const live = opts.live !== false;
  const now = opts.now ?? (() => performance.now());
  const idleMs =
    opts.idleMs ?? (typeof location === "undefined" ? 30_000 : idleFrom(location.search));
  const clock = createCueClock({ idleMs });

  let paused = $state(false);
  /** True from hide until the page is visible again. Resume is refused. */
  let pageHidden = false;
  /**
   * Why the game is paused. Manual wins: hiding the page does not
   * turn a chosen pause into an automatic one. Cleared on any resume.
   * @type {null | 'manual' | 'auto'}
   */
  let reason = $state(null);
  /** @type {'idle' | 'hold' | 'reveal'} */
  let resumePhase = $state("idle");
  /** When the current hold or reveal is due, on `now()`. */
  let phaseEnds = 0;
  /** @type {null | 'options' | 'confirm'} */
  let modal = $state(null);
  /** Where focus goes when the options sheet opens. */
  /** @type {'cue' | 'restart'} */
  let focus = $state("cue");
  const initialCue = readCuePref();
  let cuePref = $state(initialCue);
  let tapFill = $state(readTapFill());
  let auto = $state(true);
  let reduced = $state(false);
  let solved = $state(false);
  /** @type {'idle' | 'flash' | 'hold'} */
  let phase = $state("idle");
  /** Lone cells snapped when the current pulse began. */
  let pulse = $state(/** @type {number[]} */ ([]));

  /** @type {() => number[]} */
  let loneCells = () => [];
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let resumeTimer = 0;
  /** @type {((info: { announce: boolean }) => void) | null} */
  let onAutoResumed = null;
  /** @type {(() => Promise<unknown>) | null} */
  let revealCompletion = null;
  let waitingForAnimation = false;
  let resumeGeneration = 0;

  clock.setEnabled(initialCue);

  function applyBlock() {
    clock.setBlocked(paused || modal != null || solved);
  }

  function syncFromClock() {
    phase = clock.phase;
    if (clock.justFired) pulse = loneCells();
    else if (!clock.showing) pulse = [];
  }

  /** @param {number} [t] */
  function schedule(t = now()) {
    if (!live) return;
    if (timer) clearTimeout(timer);
    timer = 0;
    const wait = clock.nextWait(t);
    if (wait == null) return;
    timer = setTimeout(() => {
      timer = 0;
      const at = now();
      clock.tick(at);
      syncFromClock();
      schedule(at);
    }, wait);
  }

  /** @param {number} [t] */
  function bump(t = now()) {
    clock.bump(t);
    syncFromClock();
    schedule(t);
  }

  function clearResumeTimer() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = 0;
  }

  /** @param {number} ms */
  function armResume(ms) {
    if (!live) return;
    clearResumeTimer();
    resumeTimer = setTimeout(
      () => {
        resumeTimer = 0;
        advanceResume();
      },
      Math.max(0, ms)
    );
  }

  /** Each visual phase starts when its callback actually runs. */
  function advanceResume() {
    if (resumePhase === "idle") return;
    const t = now();
    if (t < phaseEnds) {
      // Timers can fire early; injected clocks can also move backward.
      armResume(phaseEnds - t);
      return;
    }
    if (resumePhase === "hold") {
      resumePhase = "reveal";
      phaseEnds = t + RESUME_REVEAL_MS;
      armResume(RESUME_REVEAL_MS);
      return;
    }
    if (revealCompletion && !waitingForAnimation) {
      // Rendering can start after the state transition. Keep input blocked
      // until the board's actual animation finishes, with a bounded fallback.
      waitingForAnimation = true;
      phaseEnds = t + REVEAL_FALLBACK_MS;
      armResume(REVEAL_FALLBACK_MS);
      const generation = resumeGeneration;
      revealCompletion().then(
        () => {
          if (generation === resumeGeneration && resumePhase === "reveal") finishAutoResume();
        },
        () => {} // A cancelled animation uses the fallback.
      );
      return;
    }
    finishAutoResume();
  }

  /** Drop a hold or reveal without resuming. The pause reason stays. */
  function cancelReveal() {
    clearResumeTimer();
    resumeGeneration += 1;
    waitingForAnimation = false;
    resumePhase = "idle";
    phaseEnds = 0;
  }

  function unpause() {
    cancelReveal();
    paused = false;
    reason = null;
    timerRunning.set(true);
    applyBlock();
    bump(now());
  }

  function finishAutoResume() {
    if (!paused) {
      cancelReveal();
      return;
    }
    unpause();
    onAutoResumed?.({ announce: true });
  }

  /** Stop the clock, close a dialog, and block the cue. `paused` is already set. */
  function engagePause() {
    timerRunning.set(false);
    if (modal) modal = null;
    applyBlock();
    bump(now());
  }

  return {
    get paused() {
      return paused;
    },
    get reason() {
      return reason;
    },
    get resumePhase() {
      return resumePhase;
    },
    get modal() {
      return modal;
    },
    get focus() {
      return focus;
    },
    get phase() {
      return phase;
    },
    get pulse() {
      return pulse;
    },
    get cuePref() {
      return cuePref;
    },
    /** Legacy tap-to-fill. Off by default. */
    get tapFill() {
      return tapFill;
    },
    get auto() {
      return auto;
    },
    get reduced() {
      return reduced;
    },
    get idleMs() {
      return clock.idleMs;
    },
    get switchChecked() {
      return auto && cuePref;
    },
    get switchDisabled() {
      return !auto;
    },
    /** Sub line: the reason replaces the description while Manual is on. */
    get cueReason() {
      return !auto;
    },

    /** @param {number} cellId */
    showsCue(cellId) {
      return (phase === "flash" || phase === "hold") && pulse.includes(cellId);
    },

    /** @param {() => number[]} fn cells that are lone right now */
    bindLones(fn) {
      loneCells = fn;
    },

    /** Begin the idle countdown. Call once when the play view mounts. */
    start() {
      clock.setReduced(reduced);
      bump(now());
    },

    /**
     * Advance the cue clock to `now()`. The app reaches the same transitions
     * from `setTimeout`; tests call this after moving their clock.
     */
    step() {
      advanceResume();
      const t = now();
      clock.tick(t);
      syncFromClock();
      schedule(t);
    },

    /**
     * Restart the idle clock after a board change or a Notes mode switch.
     * Selection, hovering, and attempts that change nothing do not call this.
     */
    noteActivity() {
      bump(now());
    },

    /** @param {boolean} v */
    setAuto(v) {
      const next = !!v;
      if (next === auto) return;
      auto = next;
      clock.setAuto(next);
      if (!next) {
        phase = "idle";
        pulse = [];
      }
      schedule(now());
    },

    /** @param {boolean} v */
    setReduced(v) {
      reduced = !!v;
      clock.setReduced(reduced);
    },

    toggleTapFill() {
      tapFill = !tapFill;
      writeTapFill(tapFill);
    },

    toggleCue() {
      if (!auto) return;
      cuePref = !cuePref;
      writeCuePref(cuePref);
      clock.setEnabled(cuePref);
      if (!cuePref) {
        phase = "idle";
        pulse = [];
        bump(now());
      }
    },

    /**
     * The player paused (Pause button or P). A pause already in progress,
     * including an automatic one, is left as it is.
     * @returns {boolean} whether the game was not already paused
     */
    pause() {
      if (paused) return false;
      cancelReveal();
      paused = true;
      reason = "manual";
      engagePause();
      return true;
    },

    /**
     * Refused while the page is hidden, so the clock cannot run off screen.
     * The cover, the reason, and focus stay as they are.
     * @returns {boolean} whether the game was paused
     */
    resume() {
      if (!paused || pageHidden) return false;
      unpause();
      return true;
    },

    /** @returns {'paused' | 'resumed' | 'ignored'} */
    toggle() {
      if (modal || (paused && pageHidden)) return "ignored";
      return this.pause() ? "paused" : this.resume() ? "resumed" : "ignored";
    },

    /**
     * Fired when an automatic pause finishes its reveal on the live timer.
     * Instant resumes report through {@link noteVisible} instead.
     * @param {((info: { announce: boolean }) => void) | null} fn
     */
    onAutoResume(fn) {
      onAutoResumed = fn;
    },

    /** @param {(() => Promise<unknown>) | null} fn wait for the rendered reveal */
    bindRevealCompletion(fn) {
      revealCompletion = fn;
    },

    /**
     * The page was hidden. Pause unless the board is solved or the player
     * already paused. A manual pause stays manual. Hiding again during the
     * hold or reveal cancels it and returns to a fully covered auto pause.
     * @returns {boolean} whether this call paused the game
     */
    noteHidden() {
      cancelReveal();
      pageHidden = true;
      if (solved || paused) return false;
      paused = true;
      reason = "auto";
      engagePause();
      return true;
    },

    /**
     * The page is visible again.
     * Manual pauses stay paused. An auto pause holds, then reveals, then
     * resumes — except a short absence, reduced motion, or `silent`
     * (the board is not on screen), which resume immediately.
     * Only a short absence, and a silent return, skip the announcement.
     * @param {number} awayMs
     * @param {{ silent?: boolean }} [opts]
     * @returns {'stayed' | 'quiet' | 'announced' | 'hold'}
     */
    noteVisible(awayMs, opts = {}) {
      pageHidden = false;
      if (!paused || reason !== "auto") return "stayed";
      const silent = !!opts.silent;
      const short = awayMs < RESUME_SHORT_MS;
      if (silent || short || reduced) {
        unpause();
        return !silent && !short ? "announced" : "quiet";
      }
      resumePhase = "hold";
      phaseEnds = now() + RESUME_HOLD_MS;
      armResume(RESUME_HOLD_MS);
      return "hold";
    },

    openOptions() {
      if (paused) return;
      focus = "cue";
      modal = "options";
      clock.setBlocked(true);
      bump(now());
    },

    /** Cancel/Esc on the confirm: the sheet returns with focus on Restart. */
    backToOptions() {
      if (paused) return;
      focus = "restart";
      modal = "options";
      clock.setBlocked(true);
      bump(now());
    },

    openConfirm() {
      if (paused || modal !== "options") return;
      modal = "confirm";
      clock.setBlocked(true);
      bump(now());
    },

    closeModal() {
      if (!modal) return;
      modal = null;
      applyBlock();
      bump(now());
    },

    /**
     * A solved board blocks the cue the same way pause and a dialog do.
     * Restart or a new puzzle clears it.
     * @param {boolean} v
     */
    setSolved(v) {
      const next = !!v;
      if (next === solved) return;
      solved = next;
      applyBlock();
      bump(now());
    },

    /** A new puzzle replaces the paused cover and any open dialog. */
    resetForLoad() {
      const was = paused || modal != null || solved || resumePhase !== "idle";
      cancelReveal();
      paused = false;
      reason = null;
      modal = null;
      solved = false;
      clock.setBlocked(false);
      if (was) bump(now());
    },
  };
}

export const playUi = createPlay({ live: typeof window !== "undefined" });
