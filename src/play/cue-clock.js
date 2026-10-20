/** Idle time before the single-candidate cue, and the length of one pulse. */
export const CUE_IDLE_MS = 30_000;
export const CUE_FLASH_MS = 1_500;

/**
 * @param {string} search
 * @returns {number} a positive override from `cueMs`, otherwise {@link CUE_IDLE_MS}
 */
export function idleMsFromSearch(search) {
  const n = Number(new URLSearchParams(search).get("cueMs"));
  return Number.isFinite(n) && n > 0 ? n : CUE_IDLE_MS;
}

/**
 * @typedef {'idle' | 'flash' | 'hold'} CuePhase
 */

/**
 * One shared clock for every lone candidate.
 * `t` is milliseconds from an injected clock (`Date.now` in the app).
 * The next pulse is scheduled from the start of the current one, so a 30 s
 * idle repeats every 30 s, not 30 s after the 1.5 s flash ends.
 *
 * @param {{ idleMs?: number, flashMs?: number }} [opts]
 */
export function createCueClock({ idleMs = CUE_IDLE_MS, flashMs = CUE_FLASH_MS } = {}) {
  let enabled = true;
  let auto = true;
  let blocked = false;
  let reduced = false;
  /** @type {CuePhase} */
  let phase = "idle";
  let due = 0;
  let flashEnds = 0;
  let started = false;
  let generation = 0;
  let justFired = false;

  const eligible = () => enabled && auto && !blocked;

  /** @param {number} t */
  function arm(t) {
    phase = "idle";
    due = t + idleMs;
    flashEnds = 0;
    started = true;
    justFired = false;
  }

  return {
    get idleMs() {
      return idleMs;
    },
    get flashMs() {
      return flashMs;
    },
    get phase() {
      return phase;
    },
    get generation() {
      return generation;
    },
    get justFired() {
      return justFired;
    },
    get showing() {
      return phase === "flash" || phase === "hold";
    },
    get switchOn() {
      return auto && enabled;
    },
    get switchDisabled() {
      return !auto;
    },
    get enabled() {
      return enabled;
    },

    /** @param {boolean} v */
    setEnabled(v) {
      enabled = !!v;
      if (!eligible()) {
        phase = "idle";
        justFired = false;
      }
    },
    /** @param {boolean} v */
    setAuto(v) {
      auto = !!v;
      if (!auto) {
        phase = "idle";
        justFired = false;
      }
    },
    /** @param {boolean} v */
    setBlocked(v) {
      blocked = !!v;
      if (blocked) {
        phase = "idle";
        justFired = false;
      }
    },
    /** @param {boolean} v */
    setReduced(v) {
      reduced = !!v;
    },

    /** Restart the idle countdown and end a pulse that is already showing. @param {number} t */
    bump(t) {
      generation += 1;
      arm(t);
    },

    /**
     * Milliseconds until the next transition, or null if the clock should sleep
     * (paused, a dialog, Manual, held reduced-motion tint, or not started).
     * @param {number} t
     * @returns {number | null}
     */
    nextWait(t) {
      if (!started || !eligible() || phase === "hold") return null;
      if (phase === "flash") return Math.max(0, Math.min(flashEnds, due) - t);
      return Math.max(0, due - t);
    },

    /**
     * Advance to time t. `justFired` is true for the tick a pulse begins,
     * so the caller can snapshot the lone cells on that instant.
     * @param {number} t
     * @returns {boolean} whether the visible phase changed
     */
    tick(t) {
      justFired = false;
      if (!started) arm(t);
      if (!eligible() || phase === "hold") return false;
      if (phase === "flash") {
        if (t < flashEnds && t < due) return false;
        if (t >= due) {
          generation += 1;
          justFired = true;
          if (reduced) {
            phase = "hold";
            return true;
          }
          phase = "flash";
          flashEnds = t + flashMs;
          due = t + idleMs;
          return true;
        }
        phase = "idle";
        return true;
      }
      if (t < due) return false;
      generation += 1;
      justFired = true;
      if (reduced) {
        phase = "hold";
        return true;
      }
      phase = "flash";
      flashEnds = t + flashMs;
      due = t + idleMs;
      return true;
    },
  };
}
