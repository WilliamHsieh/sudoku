// Travelling undo/redo ring. Toolbar undo/redo delay the state change until
// the ring lands (prototype). Keyboard Ctrl+Z stays immediate.

import { RING, EASE_OUT, ringTiming } from "./game/pad.js";
import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";

const HL_IN_MS = 150;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function restartClass(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export function createRingController() {
  /** @type {HTMLElement | null} */
  let wrapEl = null;
  /** @type {HTMLElement | null} */
  let ringEl = null;
  /** @type {{ apply: () => void, timer: ReturnType<typeof setTimeout> } | null} */
  let pending = null;
  let ringEndsAt = -Infinity;
  let lastRingCell = -1;
  let quietTimer = 0;

  function bind(wrap, ring) {
    wrapEl = wrap;
    ringEl = ring;
  }

  function flush() {
    if (!pending) return;
    const p = pending;
    pending = null;
    clearTimeout(p.timer);
    p.apply();
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
          ? { transform: at(b, 1.4), opacity: 0, easing: EASE_OUT }
          : { transform: at(a), opacity: 1, easing: EASE_OUT },
        { transform: at(b), opacity: 1, offset: t.travel / total },
        { transform: at(b), opacity: 1, offset: (t.travel + t.apply) / total },
        { transform: at(b), opacity: 0 },
      ],
      { duration: total }
    );
  }

  function quietHighlights(ms) {
    clearTimeout(quietTimer);
    padUi.quiet = true;
    wrapEl?.querySelector(".board")?.classList.remove("hl-in");
    quietTimer = window.setTimeout(() => {
      padUi.quiet = false;
      const board = wrapEl?.querySelector(".board");
      if (board && !reducedMotion()) restartClass(board, "hl-in", HL_IN_MS);
    }, ms);
  }

  /** @param {'undo' | 'redo'} dir */
  function travel(dir) {
    const now = performance.now();
    const rapid = !!pending || now < ringEndsAt + RING.rapidGap;
    flush();
    const peek = dir === "undo" ? game.peekUndo() : game.peekRedo();
    if (!peek) return;
    const start = game.selected >= 0 ? game.selected : lastRingCell >= 0 ? lastRingCell : 40;
    const first = peek.first >= 0 ? peek.first : start;
    const apply = () => {
      if (dir === "undo") game.undo();
      else game.redo();
      if (first >= 0) game.select(first);
      padUi.undoTargets = peek.cells.filter((i) => i !== first);
      window.setTimeout(() => {
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
      quietHighlights(RING.still);
      ringEndsAt = now + RING.still;
      apply();
      window.setTimeout(() => {
        padUi.undoTargets = [];
      }, RING.still);
      return;
    }
    const t = ringTiming(start, first, rapid);
    const total = t.travel + t.apply + t.fade;
    moveRing(start, first, t);
    quietHighlights(total);
    ringEndsAt = now + total;
    pending = {
      apply,
      timer: setTimeout(() => {
        pending = null;
        apply();
      }, t.travel + t.apply),
    };
  }

  return {
    bind,
    flush,
    undo: () => travel("undo"),
    redo: () => travel("redo"),
  };
}

export const ring = createRingController();
