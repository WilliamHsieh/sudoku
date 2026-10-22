<script>
  import { onMount } from "svelte";
  import { FLY_MS, RETURN_MS, EASE_OUT, rubberBand, nextArmed, shouldLift } from "./game/pad.js";
  import { HOLD_MS, classifyPress, classifyRelease, nextLockArmed } from "./game/key-gesture.js";
  import { game } from "./game/game.svelte.js";
  import { padUi } from "./pad-ui.svelte.js";
  import { playUi } from "./play/session.svelte.js";
  import {
    activateKey,
    clearHideTimer,
    clearHoldMarks,
    fillFocused,
    flashBlocked,
    lastKeyPress,
    lockDigit,
    scheduleHide,
    setLastKeyPress,
    unlockKeepShown,
  } from "./keypad-actions.js";
  import {
    ariaEnter,
    ariaLocked,
    ariaShow,
    COACH_OK,
    COACH_ROWS,
    COACH_TITLE,
    LABEL_HOLD,
    LABEL_LOCK,
    LABEL_UNLOCK,
  } from "./keypad-copy.js";

  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const COACH_KEY = "sudoku-keypad-coach";

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
   * @property {boolean} armLock
   * @property {boolean} lifting
   * @property {boolean} holding
   * @property {HTMLElement | null} lift
   * @property {boolean} concealed
   * @property {{ x: number, y: number }} origin
   * @property {{ x: number, y: number }} offset
   * @property {number[]} blockers
   * @property {boolean} dbl
   * @property {boolean} wasShown
   * @property {number} wasLocked
   * @property {boolean} legacy
   * @property {ReturnType<typeof setTimeout> | 0} holdTimer
   */

  /** @type {Gesture | null} */
  let gesture = null;
  /** @type {{ key: HTMLButtonElement, hidesKey: boolean, settled: boolean, settle: () => void, anim: Animation | null }[]} */
  const flights = [];
  /** How many in-flight hides are covering each digit. */
  let concealed = $state(/** @type {Record<number, number>} */ ({}));
  let pointerGuard = 0;

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @param {number} d @param {number} delta */
  function concealBy(d, delta) {
    const next = { ...concealed };
    const n = (next[d] ?? 0) + delta;
    if (n <= 0) delete next[d];
    else next[d] = n;
    concealed = next;
  }

  /** @param {Element} el */
  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  /** @param {number} i @param {number} d */
  function noteEl(i, d) {
    return document.querySelector(`.board > .cell[data-i="${i}"] .pencil-box[data-d="${d}"]`);
  }

  /** @param {number} ms */
  function haptic(ms) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* unsupported */
      }
    }
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

  /** @param {Gesture} g */
  function labelText(g) {
    if (!g.mode) return "";
    if (g.blockers.length) return "Not allowed";
    return g.mode === "remove" ? "\u2212 candidate" : "+ candidate";
  }

  /** @param {Gesture} g */
  function syncGesture(g) {
    const toggled = padUi.hold && padUi.hold.d === g.d ? padUi.hold.toggled : 0;
    const holding = (g.holding || toggled > 0) && !g.armLock && !g.armed;
    padUi.gesture = {
      d: g.d,
      pressed: true,
      holding,
      armed: g.armed && !g.armLock,
      armLock: g.armLock,
      remove: g.mode === "remove",
      illegal: g.blockers.length > 0,
      showLabel: holding || (g.lifting && !g.armLock && !!g.mode),
      label: holding ? LABEL_HOLD : g.lifting && !g.armLock ? labelText(g) : "",
      bottom: g.armLock ? (g.wasLocked === g.d ? LABEL_UNLOCK : LABEL_LOCK) : "",
    };
  }

  /** @param {PointerEvent} e @param {HTMLButtonElement} key */
  function startGesture(e, key) {
    const d = Number(key.dataset.d);
    const now = performance.now();
    const i = game.selected;
    const canNote = game.editable(i) && !game.value(i);
    const mode = canNote ? (game.hasNote(i, d) ? "remove" : "add") : null;
    const blockers = mode === "add" && game.wouldAddNote(i, d) ? game.noteBlockers(i, d) : [];
    const digit = key.querySelector(".digit");
    const last = lastKeyPress();
    const press = classifyPress(
      {
        shown: padUi.shown,
        locked: padUi.locked,
        lastD: last.d,
        lastT: last.t,
        legacy: playUi.tapFill,
      },
      d,
      now
    );
    /** @type {Gesture} */
    const g = {
      id: e.pointerId,
      key,
      d,
      cell: i,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      t0: now,
      maxTravel: 0,
      armed: false,
      armLock: false,
      lifting: false,
      holding: false,
      lift: null,
      concealed: false,
      origin: center(digit ?? key),
      offset: { x: 0, y: 0 },
      blockers,
      dbl: press.dbl,
      wasShown: padUi.shown === d && !press.dbl,
      wasLocked: padUi.locked,
      legacy: playUi.tapFill,
      holdTimer: 0,
    };
    clearHideTimer();
    if (press.fill) {
      setLastKeyPress({ d: 0, t: -Infinity });
      fillFocused(d);
    } else if (press.show) {
      padUi.shown = d;
    }
    padUi.hold = { d, pid: e.pointerId, travel: 0, toggled: 0 };
    g.holdTimer = setTimeout(() => {
      if (gesture !== g || g.maxTravel >= 8) return;
      g.holding = true;
      syncGesture(g);
    }, HOLD_MS);
    syncGesture(g);
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
    if (!g.concealed) {
      concealBy(g.d, 1);
      g.concealed = true;
    }
    positionLift(g);
  }

  /** @param {Gesture} g */
  function positionLift(g) {
    if (!g.lift) return;
    const x = g.origin.x + g.offset.x;
    const y = g.origin.y + g.offset.y;
    g.lift.style.transform = liftTransform(x, y);
  }

  /** @param {Gesture} g */
  function dropLift(g) {
    g.lift?.remove();
    g.lift = null;
    if (g.concealed) {
      concealBy(g.d, -1);
      g.concealed = false;
    }
  }

  /** @param {PointerEvent} e */
  function moveGesture(e) {
    const g = gesture;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const up = g.startY - e.clientY;
    const down = e.clientY - g.startY;
    g.maxTravel = Math.max(g.maxTravel, Math.hypot(dx, up));
    if (padUi.hold && padUi.hold.pid === g.id) padUi.hold.travel = g.maxTravel;
    if (g.maxTravel >= 8 && padUi.hold && padUi.hold.toggled === 0) {
      clearTimeout(g.holdTimer);
      g.holding = false;
    }
    if (!g.lifting && shouldLift(up, dx)) g.lifting = true;

    let armed = false;
    if (g.lifting) armed = nextArmed(g.armed, up, !!g.mode);
    let armLock = nextLockArmed(g.armLock, down, dx);
    if (armLock) armed = false;
    else if (armed) armLock = false;

    if (g.lifting && g.mode && !armLock) {
      if (g.blockers.length) padUi.blocking = g.blockers;
      else if (!padUi.preview) padUi.preview = { cell: g.cell, d: g.d, kind: g.mode };
    } else if (!g.lifting || armLock) {
      padUi.preview = null;
      padUi.blocking = [];
    }

    if (g.lifting && !armLock && !reduced()) {
      ensureLift(g);
      g.offset = { x: dx * 0.15, y: -rubberBand(up) };
      positionLift(g);
    }

    if (g.armed !== armed) {
      g.armed = armed;
      if (armed) haptic(8);
    }
    if (g.armLock !== armLock) {
      g.armLock = armLock;
      if (armLock) haptic(8);
    }
    syncGesture(g);
  }

  /** @param {Gesture} g */
  function flyHome(g) {
    if (!g.lift) return;
    const lift = g.lift;
    g.lift = null;
    fly(lift, lift.style.transform, liftTransform(g.origin.x, g.origin.y), RETURN_MS, {
      key: g.key,
      hidesKey: true,
      done: () => {
        if (g.concealed) {
          concealBy(g.d, -1);
          g.concealed = false;
        }
      },
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
      dropLift(g);
      padUi.pending = null;
      return;
    }
    if (!slot) {
      dropLift(g);
      padUi.pending = null;
      return;
    }
    const lift = g.lift;
    g.lift = null;
    const target = center(slot);
    fly(lift, lift.style.transform, liftTransform(target.x, target.y, noteScale(slot)), FLY_MS, {
      key: g.key,
      done: () => {
        padUi.pending = null;
        if (g.concealed) {
          concealBy(g.d, -1);
          g.concealed = false;
        }
      },
    });
  }

  /** @param {Gesture} g */
  function commitRemove(g) {
    const slot = noteEl(g.cell, g.d);
    game.toggleNote(g.cell, g.d);
    dropLift(g);
    if (reduced() || !slot) return;
    const key = g.key;
    concealBy(g.d, 1);
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
      done: () => concealBy(g.d, -1),
    });
  }

  /** @param {boolean} cancelled */
  function endGesture(cancelled) {
    const g = gesture;
    if (!g) return;
    gesture = null;
    clearTimeout(g.holdTimer);
    padUi.preview = null;
    padUi.blocking = [];
    const toggled = padUi.hold && padUi.hold.pid === g.id ? padUi.hold.toggled : 0;
    padUi.hold = null;
    padUi.gesture = null;
    if (g.key.hasPointerCapture?.(g.id)) g.key.releasePointerCapture(g.id);
    const elapsed = performance.now() - g.t0;
    const kind = classifyRelease({
      cancelled,
      maxTravel: g.maxTravel,
      elapsed,
      toggled,
      armLock: g.armLock,
      armed: g.armed,
      dbl: g.dbl,
      legacy: g.legacy,
      d: g.d,
      wasLocked: g.wasLocked,
      wasShown: g.wasShown,
    });

    // Master flashes blockers on any release. r2 keeps that for an armed
    // swipe-up only; legacy tap-to-fill matches master, including a tap that
    // then enters the digit.
    if (!cancelled && g.blockers.length && (g.legacy || kind === "swipe-up")) {
      flashBlocked(g.blockers);
    }

    if (kind === "lock" || kind === "switch-lock") {
      dropLift(g);
      lockDigit(g.d);
    } else if (kind === "unlock-swipe" || kind === "unlock-tap") {
      dropLift(g);
      unlockKeepShown();
    } else if (kind === "held") {
      dropLift(g);
      clearHoldMarks();
      if (padUi.locked) padUi.shown = padUi.locked;
    } else if (kind === "swipe-up" && g.blockers.length) {
      if (g.lift) flyHome(g);
      else dropLift(g);
    } else if (kind === "swipe-up" && g.mode === "add") {
      commitAdd(g);
    } else if (kind === "swipe-up" && g.mode === "remove") {
      commitRemove(g);
    } else if (kind === "show-other") {
      dropLift(g);
      unlockKeepShown();
      padUi.shown = g.d;
      setLastKeyPress({ d: g.d, t: g.t0 });
    } else if (kind === "legacy") {
      dropLift(g);
      if (game.selected >= 0) game.enter(game.selected, g.d);
      padUi.shown = 0;
    } else if (kind === "show" || kind === "hide-later") {
      dropLift(g);
      setLastKeyPress({ d: g.d, t: g.t0 });
      if (kind === "hide-later") scheduleHide(g.d);
    } else if (g.lift) {
      flyHome(g);
    } else {
      dropLift(g);
    }

    if (padUi.locked) padUi.shown = padUi.locked;
    clearHoldMarks();
  }

  /** @param {PointerEvent} e */
  function ours(e) {
    return !!(gesture && e.pointerId === gesture.id);
  }

  /** @param {PointerEvent} e */
  function onKeyPointerDown(e) {
    if (playUi.paused) return;
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    pointerGuard = performance.now() + 700;
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

  /** @param {MouseEvent} e @param {number} d */
  function onKeyClick(e, d) {
    if (e.detail !== 0) return;
    if (performance.now() < pointerGuard) return;
    activateKey(d);
  }

  /** @param {PointerEvent} e */
  function onLostCapture(e) {
    const key = /** @type {HTMLButtonElement} */ (e.currentTarget);
    if (ours(e) && gesture && gesture.key === key) endGesture(true);
  }

  function dismissCoach() {
    padUi.coach = false;
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  /** @param {number} d */
  function keyLabel(d) {
    if (padUi.locked === d) return ariaLocked(d);
    if (playUi.tapFill) return ariaEnter(d);
    return ariaShow(d);
  }

  onMount(() => {
    const q = new URLSearchParams(location.search);
    const kp = q.get("kp");
    if (kp === "coach") padUi.coach = true;
    else if (!kp) {
      let seen = false;
      try {
        seen = localStorage.getItem(COACH_KEY) === "1";
      } catch {
        seen = true;
      }
      padUi.coach = !seen;
    }

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
    };
  });
</script>

<div class="pad">
  {#if padUi.coach}
    <div class="coach" role="dialog" aria-labelledby="coach-title">
      <h2 id="coach-title">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22 14a8 8 0 0 1-8 8"></path>
          <path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2"></path>
          <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1"></path>
          <path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10"></path>
          <path
            d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
          ></path>
        </svg>
        {COACH_TITLE}
      </h2>
      <ul>
        {#each COACH_ROWS as row (row.label)}
          <li><b>{row.label}</b>{row.body}</li>
        {/each}
      </ul>
      <div class="acts">
        <button type="button" class="btn" id="coach-ok" onclick={dismissCoach}>{COACH_OK}</button>
      </div>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="keypad"
    id="keypad"
    aria-label="Number keypad"
    data-shown={padUi.locked || padUi.shown || 0}
    data-locked={padUi.locked || 0}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#each DIGITS as d (d)}
      <button
        type="button"
        class="key"
        class:pressed={padUi.gesture?.d === d}
        class:shown={padUi.locked !== d &&
          (padUi.locked || padUi.shown) === d &&
          !(padUi.gesture?.d === d && padUi.gesture.holding)}
        class:holding={padUi.gesture?.d === d && padUi.gesture.holding && padUi.locked !== d}
        class:armed={padUi.gesture?.d === d && padUi.gesture.armed}
        class:arm-lock={padUi.gesture?.d === d && padUi.gesture.armLock}
        class:locked={padUi.locked === d}
        class:remove={padUi.gesture?.d === d && padUi.gesture.remove}
        class:illegal={padUi.gesture?.d === d && padUi.gesture.illegal}
        class:show-label={padUi.gesture?.d === d && padUi.gesture.showLabel}
        class:lifted={!!concealed[d]}
        data-d={d}
        aria-pressed={padUi.locked === d}
        aria-label={keyLabel(d)}
        onpointerdown={onKeyPointerDown}
        onclick={(e) => onKeyClick(e, d)}
        onlostpointercapture={onLostCapture}
      >
        <span class="digit">{d}</span>
        <span class="label">{padUi.gesture?.d === d ? padUi.gesture.label : ""}</span>
        <span class="label bottom">{padUi.gesture?.d === d ? padUi.gesture.bottom : ""}</span>
        <svg class="lock" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </button>
    {/each}
  </div>
</div>

<style>
  .pad {
    position: relative;
  }

  .keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    touch-action: none;
    overscroll-behavior: none;
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
      background 80ms ease-out,
      box-shadow 80ms ease-out,
      color 80ms ease-out;
    overflow: visible;
    appearance: none;
    padding: 0;
    -webkit-touch-callout: none;
    user-select: none;
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

  .key::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 18%;
    right: 18%;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: transparent;
  }

  .key.pressed {
    transform: scale(0.95);
    background: var(--key-pressed);
  }
  .key.pressed.illegal {
    background: var(--key-pressed-illegal);
  }
  .key.shown {
    box-shadow:
      inset 0 0 0 2px var(--chip-line),
      var(--key-shadow);
    background: var(--chip-bg);
    color: var(--chip-ink);
  }
  .key.holding {
    box-shadow:
      inset 0 0 0 2px var(--sel-ring),
      var(--key-shadow);
    background: var(--sel-bg);
    color: var(--ink);
  }
  .key.locked {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-accent);
    box-shadow: 0 1px 0 #000;
  }
  .key.locked.pressed {
    background: var(--primary-hover);
  }
  .key.armed::before {
    background: var(--sel-ring);
  }
  .key.armed.remove::before {
    background: var(--conflict);
  }
  .key.armed.illegal::before {
    background: var(--undo-ring);
  }
  .key.arm-lock::after {
    background: var(--sel-ring);
  }
  .key.locked.arm-lock::after {
    background: var(--on-accent);
  }

  .key .lock {
    position: absolute;
    top: 7px;
    right: 8px;
    width: 14px;
    height: 14px;
    display: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .key.locked .lock,
  .key.arm-lock .lock {
    display: block;
  }
  .key.arm-lock:not(.locked) .lock {
    color: var(--sel-ring);
  }

  .key .digit {
    font-size: inherit;
    font-weight: inherit;
    line-height: 1;
  }
  .key.lifted .digit {
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
    line-height: 1.2;
    transition: opacity 80ms ease-out;
  }
  .key .label.bottom {
    top: auto;
    bottom: 6px;
  }
  .key.remove .label:not(.bottom) {
    color: var(--conflict);
  }
  .key.illegal .label:not(.bottom) {
    color: var(--undo-ring);
  }
  .key.holding .label,
  .key.show-label .label,
  .key.arm-lock .label.bottom {
    opacity: 1;
  }
  .key.locked .label {
    color: var(--on-accent);
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

  .coach {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    background: var(--board-bg);
    border-radius: 14px;
    box-shadow:
      var(--shadow-dialog),
      inset 0 0 0 1px var(--hair);
    padding: 14px 14px 12px;
    z-index: 30;
    font-family: var(--ui-font);
    color: var(--ui-ink);
  }
  .coach h2 {
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .coach h2 svg {
    width: 18px;
    height: 18px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .coach ul {
    list-style: none;
    display: grid;
    gap: 6px;
    margin: 0 0 10px;
    padding: 0;
  }
  .coach li {
    display: grid;
    grid-template-columns: 96px 1fr;
    font-size: 13px;
    line-height: 1.35;
    color: var(--ui-soft);
  }
  .coach li b {
    color: var(--ui-ink);
    font-weight: 600;
    white-space: nowrap;
  }
  .coach .acts {
    display: flex;
    justify-content: flex-end;
  }
  .coach .btn {
    height: 44px;
    padding: 0 18px;
    border: 0;
    border-radius: 10px;
    background: var(--primary);
    color: var(--on-accent);
    font-family: var(--ui-font);
    font-size: 15px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }
  .coach .btn:focus {
    outline: none;
  }
  .coach .btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .key,
    .key::before,
    .key .label {
      transition: none;
    }
    .key.pressed {
      transform: none;
    }
  }
</style>
