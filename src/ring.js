// Travelling undo/redo ring. Toolbar undo/redo delay the state change until
// the ring lands. Keyboard Ctrl+Z applies immediately with the same target feedback.

import { RING, ringTiming } from "./game/pad.js";

/** Shared ease. The keypad keeps its own curve in pad.js. */
const MOTION_EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";
import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import { revealCellDigit, syncHighlightAfterEdit } from "./keypad-actions.js";

const HL_IN_MS = 150;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * One delayed callback. destroy() applies it immediately so an in-flight
 * undo/redo cannot fire after the view is gone (the play view unmounts when
 * switching to the calendar). Applying now keeps history in sync with the
 * tap the user already made; cancelling would drop it.
 * @param {typeof setTimeout} [schedule]
 * @param {typeof clearTimeout} [cancel]
 */
export function createDeferredAction(schedule = setTimeout, cancel = clearTimeout) {
  /** @type {{ apply: () => void, timer: ReturnType<typeof setTimeout> } | null} */
  let pending = null;
  return {
    /** @param {() => void} apply @param {number} ms */
    schedule(apply, ms) {
      this.flush();
      const entry = {
        apply,
        timer: schedule(() => {
          pending = null;
          apply();
        }, ms),
      };
      pending = entry;
    },
    flush() {
      if (!pending) return;
      const p = pending;
      pending = null;
      cancel(p.timer);
      p.apply();
    },
    /** Apply now if one is waiting; never leave a timer behind. */
    destroy() {
      this.flush();
    },
    get isPending() {
      return pending !== null;
    },
  };
}

export function createRingController() {
  /** @type {HTMLElement | null} */
  let wrapEl = null;
  /** @type {HTMLElement | null} */
  let ringEl = null;
  const deferred = createDeferredAction();
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();
  let lastRingCell = -1;
  let ringEndsAt = -Infinity;

  /** @param {() => void} fn @param {number} ms */
  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function bind(wrap, ring) {
    wrapEl = wrap;
    ringEl = ring;
  }

  function flush() {
    deferred.flush();
  }

  /**
   * Apply any in-flight undo/redo immediately, drop cosmetic timers, and
   * release DOM bindings. Safe to call twice.
   */
  function destroy() {
    deferred.destroy();
    clearTimers();
    if (ringEl) {
      for (const anim of ringEl.getAnimations()) anim.cancel();
      ringEl.style.opacity = "0";
    }
    wrapEl?.querySelector(".board")?.classList.remove("hl-in", "quiet");
    wrapEl = null;
    ringEl = null;
    padUi.quiet = false;
    padUi.undoTargets = [];
    ringEndsAt = -Infinity;
  }

  function box(i) {
    const cell = wrapEl?.querySelector(`.board > .cell[data-i="${i}"]`);
    if (!cell || !wrapEl) return { x: 0, y: 0, w: 0, h: 0 };
    const wrap = wrapEl.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    return { x: r.left - wrap.left, y: r.top - wrap.top, w: r.width, h: r.height };
  }

  /** @param {number} from @param {number} to @param {{ travel: number, apply: number, fade: number }} t */
  function moveRing(from, to, t) {
    if (!ringEl) return;
    const a = box(from);
    const b = box(to);
    const at = (p, s = 1) => `translate(${p.x}px, ${p.y}px) scale(${s})`;
    const total = t.travel + t.apply + t.fade;
    ringEl.style.width = `${b.w}px`;
    ringEl.style.height = `${b.h}px`;
    for (const anim of ringEl.getAnimations()) anim.cancel();
    ringEl.animate(
      [
        from === to
          ? { transform: at(b, 1.4), opacity: 0, easing: MOTION_EASE }
          : { transform: at(a), opacity: 1, easing: MOTION_EASE },
        { transform: at(b), opacity: 1, offset: t.travel / total },
        { transform: at(b), opacity: 1, offset: (t.travel + t.apply) / total },
        { transform: at(b), opacity: 0 },
      ],
      { duration: total }
    );
  }

  function restartClass(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    later(() => el.classList.remove(cls), ms);
  }

  function quietHighlights(ms) {
    padUi.quiet = true;
    wrapEl?.querySelector(".board")?.classList.remove("hl-in");
    later(() => {
      padUi.quiet = false;
      const board = wrapEl?.querySelector(".board");
      if (board && !reducedMotion()) restartClass(board, "hl-in", HL_IN_MS);
    }, ms);
  }

  /** @param {'undo' | 'redo'} dir @param {{ immediate?: boolean, syncHighlight?: boolean }} options */
  function travel(dir, { immediate = false, syncHighlight = false } = {}) {
    const now = performance.now();
    const rapid = deferred.isPending || now < ringEndsAt + RING.rapidGap;
    flush();
    const peek = dir === "undo" ? game.peekUndo() : game.peekRedo();
    if (!peek) return;
    const start = game.selected >= 0 ? game.selected : lastRingCell >= 0 ? lastRingCell : 40;
    const first = peek.first >= 0 ? peek.first : start;
    const apply = () => {
      const before = first >= 0 ? game.value(first) : 0;
      if (dir === "undo") game.undo();
      else game.redo();
      if (first >= 0) {
        game.select(first);
        revealCellDigit(first);
        if (syncHighlight) syncHighlightAfterEdit(first, before);
      }
      padUi.undoTargets = peek.cells.filter((i) => i !== first);
      later(() => {
        padUi.undoTargets = [];
      }, RING.fade);
    };
    if (!peek.cells.length) {
      apply();
      return;
    }
    lastRingCell = first;
    if (reducedMotion()) {
      padUi.undoTargets = peek.cells;
      if (!immediate) quietHighlights(RING.still);
      ringEndsAt = now + RING.still;
      apply();
      later(() => {
        padUi.undoTargets = [];
      }, RING.still);
      return;
    }
    const t = ringTiming(start, first, rapid);
    const total = t.travel + t.apply + t.fade;
    moveRing(start, first, t);
    if (!immediate) quietHighlights(total);
    ringEndsAt = now + total;
    if (immediate) apply();
    else deferred.schedule(apply, t.travel + t.apply);
  }

  return {
    bind,
    flush,
    destroy,
    undo: (options = {}) => travel("undo", options),
    redo: (options = {}) => travel("redo", options),
  };
}

export const ring = createRingController();
