<script>
  import { onMount } from "svelte";
  import {
    FLY_MS,
    RETURN_MS,
    EASE_OUT,
    rubberBand,
    isTap,
    nextArmed,
    shouldLift,
  } from "./game/pad.js";
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";

  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const BLOCKED_MS = 300;

  /**
   * @typedef {Object} Gesture
   * @property {number} id
   * @property {HTMLButtonElement} key
   * @property {number} d
   * @property {number} cell
   * @property {'add' | 'remove' | null} mode
   * @property {number} startX
   * @property {number} startY
   * @property {number} t0
   * @property {number} maxTravel
   * @property {boolean} armed
   * @property {boolean} lifting
   * @property {HTMLElement | null} lift
   * @property {{ x: number, y: number }} origin
   * @property {{ x: number, y: number }} offset
   * @property {number[]} blockers
   */

  /** @type {Gesture | null} */
  let gesture = null;
  /** @type {{ key: HTMLButtonElement, hidesKey: boolean, settled: boolean, settle: () => void, anim: Animation | null }[]} */
  const flights = [];
  /** @type {ReturnType<typeof setTimeout> | 0} */
  let blockedTimer = 0;

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @param {Element} el */
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  /** @param {number} i @param {number} d */
  function noteEl(i, d) {
    return document.querySelector(`.board > .cell[data-i="${i}"] .pencil-box[data-d="${d}"]`);
  }

  function haptic(ms) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* unsupported */
      }
    }
  }

  /** @param {HTMLButtonElement} key */
  function labelOf(key) {
    return key.querySelector(".label");
  }

  /** @param {HTMLButtonElement} key */
  function releaseKey(key) {
    const held =
      (gesture && gesture.key === key && gesture.lift) ||
      flights.some((f) => f.key === key && f.hidesKey);
    if (!held) key.classList.remove("lifted");
  }

  /**
   * @param {HTMLElement} el
   * @param {string} from
   * @param {string} to
   * @param {number} ms
   * @param {{ key: HTMLButtonElement, hidesKey?: boolean, done?: () => void }} opts
   */
  function fly(el, from, to, ms, { key, hidesKey = false, done }) {
    const f = {
      key,
      hidesKey,
      settled: false,
      anim: /** @type {Animation | null} */ (null),
      settle: () => {},
    };
    f.settle = () => {
      if (f.settled) return;
      f.settled = true;
      const idx = flights.indexOf(f);
      if (idx >= 0) flights.splice(idx, 1);
      f.anim?.cancel();
      el.remove();
      done?.();
      releaseKey(key);
    };
    flights.push(f);
    if (!el.animate) {
      f.settle();
      return;
    }
    f.anim = el.animate([{ transform: from }, { transform: to }], {
      duration: ms,
      easing: EASE_OUT,
      fill: "forwards",
    });
    f.anim.onfinish = f.settle;
    f.anim.oncancel = f.settle;
  }

  /** @param {HTMLButtonElement} key */
  function settleFlights(key) {
    for (const f of flights.slice()) if (f.key === key) f.settle();
  }

  /** @param {number} x @param {number} y @param {number} [scale] */
  function liftTransform(x, y, scale = 1) {
    return `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
  }

  /** @param {PointerEvent} e @param {HTMLButtonElement} key */
  function startGesture(e, key) {
    const d = Number(key.dataset.d);
    const i = game.selected;
    const canNote = game.editable(i) && !game.value(i);
    const mode = canNote ? (game.hasNote(i, d) ? "remove" : "add") : null;
    const blockers = mode === "add" && game.wouldAddNote(i, d) ? game.noteBlockers(i, d) : [];
    const digit = key.querySelector(".digit");
    /** @type {Gesture} */
    const g = {
      id: e.pointerId,
      key,
      d,
      cell: i,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      t0: performance.now(),
      maxTravel: 0,
      armed: false,
      lifting: false,
      lift: null,
      origin: center(digit ?? key),
      offset: { x: 0, y: 0 },
      blockers,
    };
    key.classList.add("pressed");
    key.classList.toggle("remove", mode === "remove");
    key.classList.toggle("illegal", blockers.length > 0);
    const label = labelOf(key);
    if (label) {
      label.textContent = blockers.length
        ? "Not allowed"
        : mode === "remove"
          ? "\u2212 candidate"
          : mode === "add"
            ? "+ candidate"
            : "";
    }
    return g;
  }

  /** @param {Gesture} g */
  function ensureLift(g) {
    if (g.lift) return;
    const lift = document.createElement("div");
    lift.className = `lift ${g.blockers.length ? "illegal" : g.mode || ""}`;
    lift.textContent = String(g.d);
    document.body.appendChild(lift);
    g.lift = lift;
    g.key.classList.add("lifted");
    positionLift(g);
  }

  /** @param {Gesture} g */
  function positionLift(g) {
    if (!g.lift) return;
    const x = g.origin.x + g.offset.x;
    const y = g.origin.y + g.offset.y;
    g.lift.style.transform = liftTransform(x, y);
  }

  /** @param {PointerEvent} e */
  function moveGesture(e) {
    const g = gesture;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const up = g.startY - e.clientY;
    g.maxTravel = Math.max(g.maxTravel, Math.hypot(dx, up));
    if (!g.lifting && shouldLift(up, dx)) g.lifting = true;
    if (!g.lifting) return;

    if (g.mode) {
      g.key.classList.add("show-label");
      if (g.blockers.length) {
        padUi.blocking = g.blockers;
      } else if (!padUi.preview) {
        padUi.preview = { cell: g.cell, d: g.d, kind: g.mode };
      }
    }

    if (!reduced()) {
      ensureLift(g);
      g.offset = { x: dx * 0.15, y: -rubberBand(up) };
      positionLift(g);
    }

    const wasArmed = g.armed;
    g.armed = nextArmed(g.armed, up, !!g.mode);
    if (g.armed !== wasArmed) {
      g.key.classList.toggle("armed", g.armed);
      if (g.armed) haptic(8);
    }
  }

  /** @param {Gesture} g */
  function flyHome(g) {
    if (!g.lift) return;
    g.key.classList.add("lifted");
    fly(g.lift, g.lift.style.transform, liftTransform(g.origin.x, g.origin.y), RETURN_MS, {
      key: g.key,
      hidesKey: true,
    });
  }

  /** @param {Element} slot */
  function noteScale(slot) {
    const fs = parseFloat(getComputedStyle(slot).fontSize);
    return fs / 28;
  }

  /** @param {Gesture} g */
  function commitAdd(g) {
    const slot = noteEl(g.cell, g.d);
    padUi.pending = { cell: g.cell, d: g.d };
    game.toggleNote(g.cell, g.d);
    if (reduced() || !g.lift) {
      g.lift?.remove();
      padUi.pending = null;
      return;
    }
    if (!slot) {
      g.lift.remove();
      padUi.pending = null;
      return;
    }
    const target = center(slot);
    fly(
      g.lift,
      g.lift.style.transform,
      liftTransform(target.x, target.y, noteScale(slot)),
      FLY_MS,
      {
        key: g.key,
        done: () => {
          padUi.pending = null;
        },
      }
    );
  }

  /** @param {Gesture} g */
  function commitRemove(g) {
    const slot = noteEl(g.cell, g.d);
    game.toggleNote(g.cell, g.d);
    g.lift?.remove();
    if (reduced() || !g.lift || !slot) return;
    const key = g.key;
    key.classList.add("lifted");
    const el = document.createElement("div");
    el.className = "lift remove";
    el.textContent = String(g.d);
    document.body.appendChild(el);
    const start = center(slot);
    const scale = noteScale(slot);
    const from = liftTransform(start.x, start.y, scale);
    el.style.transform = from;
    fly(el, from, liftTransform(g.origin.x, g.origin.y), FLY_MS, {
      key,
      hidesKey: true,
    });
  }

  function flashBlocked(blockers) {
    clearTimeout(blockedTimer);
    padUi.blocked = blockers;
    blockedTimer = setTimeout(() => {
      padUi.blocked = [];
    }, BLOCKED_MS);
  }

  /** @param {boolean} cancelled */
  function endGesture(cancelled) {
    const g = gesture;
    if (!g) return;
    gesture = null;
    padUi.preview = null;
    padUi.blocking = [];
    if (g.key.hasPointerCapture?.(g.id)) g.key.releasePointerCapture(g.id);
    const elapsed = performance.now() - g.t0;
    const tap = !cancelled && isTap({ maxTravel: g.maxTravel, elapsed, cancelled });
    const commit = !cancelled && g.armed && g.mode;
    if (!cancelled && g.blockers.length) flashBlocked(g.blockers);
    g.key.classList.remove("pressed", "armed", "show-label", "remove", "illegal");
    releaseKey(g.key);

    if (tap) {
      g.lift?.remove();
      if (game.selected >= 0) game.enter(game.selected, g.d);
    } else if (commit && g.blockers.length) {
      if (g.lift) flyHome(g);
    } else if (commit) {
      if (g.mode === "add") commitAdd(g);
      else commitRemove(g);
    } else if (g.lift) {
      flyHome(g);
    }
  }

  /** @param {PointerEvent} e */
  function ours(e) {
    return !!(gesture && e.pointerId === gesture.id);
  }

  /** @param {PointerEvent} e */
  function onKeyPointerDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    const key = /** @type {HTMLButtonElement} */ (e.currentTarget);
    if (gesture) endGesture(true);
    settleFlights(key);
    gesture = startGesture(e, key);
    try {
      key.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  }

  /** @param {PointerEvent} e */
  function onLostCapture(e) {
    const key = /** @type {HTMLButtonElement} */ (e.currentTarget);
    if (ours(e) && gesture && gesture.key === key) endGesture(true);
  }

  onMount(() => {
    const onMove = (e) => {
      if (ours(e)) moveGesture(e);
    };
    const onUp = (e) => {
      if (ours(e)) endGesture(false);
    };
    const onCancel = (e) => {
      if (ours(e)) endGesture(true);
    };
    const onBlur = () => {
      if (gesture) endGesture(true);
    };
    const onVis = () => {
      if (document.hidden && gesture) endGesture(true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      if (gesture) endGesture(true);
      for (const f of flights.slice()) f.settle();
      clearTimeout(blockedTimer);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="keypad"
  id="keypad"
  aria-label="Number keypad"
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each DIGITS as d (d)}
    <button
      type="button"
      class="key"
      data-d={d}
      aria-label="Enter {d}"
      onpointerdown={onKeyPointerDown}
      onlostpointercapture={onLostCapture}
    >
      <span class="digit">{d}</span>
      <span class="label"></span>
    </button>
  {/each}
</div>

<style>
  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    touch-action: none;
  }

  .key {
    position: relative;
    height: 64px;
    border-radius: var(--key-radius);
    background: var(--key-bg);
    border: 1px solid var(--key-line);
    box-shadow: var(--key-shadow);
    display: grid;
    place-items: center;
    font-family: var(--key-font);
    font-size: var(--key-size);
    font-weight: var(--key-weight);
    color: var(--key-ink);
    touch-action: none;
    cursor: pointer;
    transition:
      transform 80ms ease-out,
      background 80ms ease-out;
    overflow: visible;
    appearance: none;
    padding: 0;
  }

  .key::before {
    content: "";
    position: absolute;
    top: 0;
    left: 18%;
    right: 18%;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: transparent;
    transition: background 80ms ease-out;
  }

  .key:global(.pressed) {
    transform: scale(0.95);
    background: var(--key-pressed);
  }
  .key:global(.pressed.illegal) {
    background: var(--key-pressed-illegal);
  }
  .key:global(.armed)::before {
    background: var(--sel-ring);
  }
  .key:global(.armed.remove)::before {
    background: var(--conflict);
  }
  .key:global(.armed.illegal)::before {
    background: var(--undo-ring);
  }
  .key .digit {
    font-size: inherit;
    font-weight: inherit;
    line-height: 1;
  }
  .key:global(.lifted) .digit {
    opacity: 0;
  }
  .key .label {
    position: absolute;
    top: 6px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--ui-font);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: var(--sel-ring);
    opacity: 0;
    transition: opacity 80ms ease-out;
  }
  .key:global(.remove) .label {
    color: var(--conflict);
  }
  .key:global(.illegal) .label {
    color: var(--undo-ring);
  }
  .key:global(.show-label) .label {
    opacity: 1;
  }

  :global(.lift) {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 50;
    pointer-events: none;
    font-family: var(--key-font);
    font-size: var(--key-size);
    font-weight: var(--key-weight);
    line-height: 1;
    color: var(--key-ink);
    will-change: transform, opacity;
  }
  :global(.lift.add) {
    color: var(--sel-ring);
  }
  :global(.lift.remove) {
    color: var(--conflict);
  }
  :global(.lift.illegal) {
    color: var(--undo-ring);
  }

  @media (prefers-reduced-motion: reduce) {
    .key,
    .key::before,
    .key .label {
      transition: none;
    }
    .key:global(.pressed) {
      transform: none;
    }
  }
</style>
