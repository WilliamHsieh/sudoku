// Pause, the options/confirm modals, and the single-candidate cue.
// The cue clock is pure (see cue-clock.js); this module is the reactive view of it.
import { timerRunning } from "../store.js";
import { createCueClock, idleMsFromSearch } from "./cue-clock.js";

const CUE_KEY = "sudoku-cue";

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
  const now = opts.now ?? (() => Date.now());
  const idleMs =
    opts.idleMs ?? (typeof location === "undefined" ? 30_000 : idleFrom(location.search));
  const clock = createCueClock({ idleMs });

  let paused = $state(false);
  /** @type {null | 'options' | 'confirm'} */
  let modal = $state(null);
  /** Where focus goes when the options sheet opens. */
  /** @type {'cue' | 'restart'} */
  let focus = $state("cue");
  const initialCue = readCuePref();
  let cuePref = $state(initialCue);
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

  return {
    get paused() {
      return paused;
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
      const t = now();
      clock.tick(t);
      syncFromClock();
      schedule(t);
    },

    /** Any puzzle input: answers, notes, erase, undo/redo, selection, the Notes toggle. */
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
     * @returns {boolean} whether the game was not already paused
     */
    pause() {
      if (paused) return false;
      paused = true;
      timerRunning.set(false);
      if (modal) modal = null;
      applyBlock();
      bump(now());
      return true;
    },

    /**
     * @returns {boolean} whether the game was paused
     */
    resume() {
      if (!paused) return false;
      paused = false;
      timerRunning.set(true);
      applyBlock();
      bump(now());
      return true;
    },

    /** @returns {'paused' | 'resumed' | 'ignored'} */
    toggle() {
      if (modal) return "ignored";
      return this.pause() ? "paused" : this.resume() ? "resumed" : "ignored";
    },

    /** Tab hidden: pause, and never auto-resume. */
    noteHidden() {
      this.pause();
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
      const was = paused || modal != null || solved;
      paused = false;
      modal = null;
      solved = false;
      clock.setBlocked(false);
      if (was) bump(now());
    },
  };
}

export const playUi = createPlay({ live: typeof window !== "undefined" });
