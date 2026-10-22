// Shared stroke lifecycle for board pointers, held keys and keyboard taps.
import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import {
  createStroke,
  paintCell,
  strokeMarks,
  strokeResult,
  strokeAnnouncement,
} from "./game/paint.js";
import { flashBlocked, showToast, clearToast } from "./keypad-actions.js";
import { toastBlocked, toastLockedCell } from "./keypad-copy.js";
import { LOCK_TICK_MS } from "./game/key-gesture.js";
import { TAP_MAX_TRAVEL } from "./game/pad.js";

/** @type {ReturnType<typeof createStroke> | null} */
let stroke = null;
/** @type {'lock' | 'hold'} */
let mode = "lock";
/** @type {ReturnType<typeof setTimeout>[]} */
let timers = [];
/** @type {(() => void) | null} */
let releaseContact = null;

export function clearPaintMarks() {
  timers.forEach(clearTimeout);
  timers = [];
  padUi.marks = null;
}

/** @param {number} d @param {'lock' | 'hold'} kind */
export function beginPaint(d, kind) {
  discardPaint();
  clearPaintMarks();
  clearToast();
  padUi.announcement = "";
  padUi.lastTap = { i: -1, t: -Infinity, hl: 0 };
  stroke = createStroke(game.beginStroke(), d);
  mode = kind;
}

/** @param {number} i */
export function enterPaint(i) {
  if (!stroke || stroke.rejected || stroke.visited.has(i)) return;
  const rejected = stroke.rejected;
  paintCell(stroke, i);
  game.previewStroke(stroke.state);
  padUi.marks = strokeMarks(stroke);
  if (!rejected && stroke.rejected) {
    flashBlocked(stroke.blockers);
    if (mode === "lock") showToast(toastBlocked(stroke.d));
  }
}

export function finishPaint() {
  const s = stroke;
  if (!s) return;
  stroke = null;
  releaseContact?.();
  padUi.finger = -1;
  game.commitStroke(strokeResult(s));
  if (mode === "lock" && !s.rejected && !s.brush && s.visited.size === 1)
    showToast(toastLockedCell(s.d));
  padUi.announcement = strokeAnnouncement(s);
  padUi.marks = { ...strokeMarks(s), phase: "hold" };
  timers.push(
    setTimeout(() => {
      if (padUi.marks) padUi.marks = { ...padUi.marks, phase: "fade" };
    }, LOCK_TICK_MS * 0.55)
  );
  timers.push(setTimeout(clearPaintMarks, LOCK_TICK_MS));
}

/** Returns true only when Escape consumed a draft. */
export function discardPaint() {
  if (!stroke) return false;
  stroke = null;
  releaseContact?.();
  game.previewStroke(null);
  padUi.finger = -1;
  clearPaintMarks();
  return true;
}

/** A board-level Svelte action: capture pointers, hit-test whole cells. @param {HTMLElement} board */
export function paintBoard(board) {
  /** @type {number | null} */
  let pid = null;
  /** @type {{ x: number, y: number } | null} */
  let last = null;
  let clickUntil = -Infinity;
  const ignored = new Set();
  const consumed = new Set();
  const release = () => {
    const id = pid;
    pid = null;
    last = null;
    if (id !== null && board.hasPointerCapture(id)) board.releasePointerCapture(id);
  };
  releaseContact = release;
  /** @param {number} x @param {number} y */
  function hit(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest(".cell");
    return cell?.parentElement === board ? Number(cell.getAttribute("data-i")) : -1;
  }
  /** @param {number} x @param {number} y */
  function track(x, y) {
    const current = hit(x, y);
    if (last) {
      const n = Math.ceil(Math.hypot(x - last.x, y - last.y) / 8);
      const from = last;
      for (let k = 1; k <= n; k++) {
        const i = hit(from.x + ((x - from.x) * k) / n, from.y + ((y - from.y) * k) / n);
        if (i < 0) break;
        enterPaint(i);
      }
    }
    if (current < 0) {
      last = null;
      padUi.finger = -1;
      return;
    }
    enterPaint(current);
    padUi.finger = current;
    last = { x, y };
  }
  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button > 0) return;
    const hold = padUi.hold;
    const holding = hold && e.pointerId !== hold.pid;
    if (!padUi.locked && !holding && !stroke) {
      clickUntil = -Infinity;
      return;
    }
    consumed.add(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    clickUntil = performance.now() + 700;
    if (
      pid !== null ||
      (holding && !hold.painting && (!padUi.gesture?.holding || hold.travel >= TAP_MAX_TRAVEL))
    ) {
      ignored.add(e.pointerId);
      return;
    }
    const i = hit(e.clientX, e.clientY);
    if (i < 0) return;
    if (!stroke) beginPaint(holding ? hold.d : padUi.locked, holding ? "hold" : "lock");
    if (holding) hold.painting = true;
    pid = e.pointerId;
    board.setPointerCapture(pid);
    track(e.clientX, e.clientY);
  }
  /** @param {PointerEvent} e */
  function move(e) {
    if (e.pointerId === pid) track(e.clientX, e.clientY);
  }
  /** @param {PointerEvent} e */
  function up(e) {
    if (ignored.delete(e.pointerId)) return;
    if (e.pointerId !== pid) return;
    clickUntil = performance.now() + 700;
    if (mode === "hold") {
      release();
      padUi.finger = -1;
    } else finishPaint();
  }
  /** @param {PointerEvent} e */
  function cancel(e) {
    if (e.type === "lostpointercapture" && e.target !== board) return;
    if (e.type === "pointercancel") consumed.delete(e.pointerId);
    if (e.pointerId === pid) discardPaint();
    ignored.delete(e.pointerId);
  }
  /** @param {MouseEvent} e */
  function click(e) {
    if (performance.now() < clickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  /** @param {PointerEvent} e */
  const endContact = (e) => {
    if (consumed.delete(e.pointerId)) clickUntil = performance.now() + 700;
  };
  const blur = () => {
    discardPaint();
  };
  const visibility = () => {
    if (document.hidden) discardPaint();
  };
  board.addEventListener("pointerdown", down, true);
  board.addEventListener("pointermove", move);
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", cancel);
  board.addEventListener("lostpointercapture", cancel);
  board.addEventListener("click", click, true);
  window.addEventListener("pointerup", endContact);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", visibility);
  return {
    destroy() {
      discardPaint();
      releaseContact = null;
      board.removeEventListener("pointerdown", down, true);
      board.removeEventListener("pointermove", move);
      board.removeEventListener("pointerup", up);
      board.removeEventListener("pointercancel", cancel);
      board.removeEventListener("lostpointercapture", cancel);
      board.removeEventListener("click", click, true);
      window.removeEventListener("pointerup", endContact);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
