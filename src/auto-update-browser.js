import { createUpdater, probeDeployment } from "./auto-update.js";
import { flushLocal, localBaseline, restoreLocalBaseline, writeVerified } from "./persistence.js";

const CHECKPOINT = "sudoku-update-checkpoint";
const ATTEMPTS = "sudoku-update-attempts";
export const UPDATE_PARAM = "_sudoku_update";

/** @param {unknown} value @param {string} target */
export function saveUpdateCheckpoint(value, target) {
  try {
    return (
      flushLocal() &&
      writeVerified(
        sessionStorage,
        CHECKPOINT,
        JSON.stringify({ target, value, local: localBaseline() })
      )
    );
  } catch {
    return false;
  }
}

/** @param {(value: any) => void} restore */
export function restoreUpdateCheckpoint(restore) {
  const url = new URL(location.href);
  const target = url.searchParams.get(UPDATE_PARAM);
  if (!target) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKPOINT) ?? "null");
    if (saved?.target !== target) return;
    if (!restoreLocalBaseline(saved.local)) return;
    restore(saved.value);
    sessionStorage.removeItem(CHECKPOINT);
    url.searchParams.delete(UPDATE_PARAM);
    history.replaceState(history.state, "", url);
  } catch {
    // Keep an unreadable checkpoint for recovery; never clear player storage.
  }
}

/**
 * Track contacts before app handlers run, but settle after their commits and
 * delayed clicks. Hidden pages cancel their existing gestures elsewhere.
 * @param {{ current: import('./auto-update.js').Build, base: string,
 * persist: (target: string) => boolean, busy: () => boolean }} options
 */
export function installAutoUpdate(options) {
  const contacts = new Set();
  const keys = new Set();
  let composing = false;
  let touches = 0;
  let quietUntil = Date.now() + 800;
  let timer;
  // A visible window can still have focus in browser chrome or another app.
  const visible = () => document.visibilityState === "visible" && document.hasFocus();
  const busy = () =>
    contacts.size > 0 ||
    touches > 0 ||
    keys.size > 0 ||
    composing ||
    Date.now() < quietUntil ||
    options.busy();
  const updater = createUpdater({
    current: options.current,
    probe: () => probeDeployment(options.base, options.current),
    persist: options.persist,
    visible,
    busy,
    wasAttempted: (target) => {
      const attempts = JSON.parse(sessionStorage.getItem(ATTEMPTS) ?? "[]");
      return !Array.isArray(attempts) || attempts.includes(target);
    },
    markAttempted: (target) => {
      const attempts = JSON.parse(sessionStorage.getItem(ATTEMPTS) ?? "[]");
      return (
        Array.isArray(attempts) &&
        writeVerified(sessionStorage, ATTEMPTS, JSON.stringify([...attempts, target]))
      );
    },
    navigate: (target) => {
      const url = new URL(location.href);
      url.searchParams.set(UPDATE_PARAM, target);
      location.replace(url.href);
    },
  });
  function settleLater() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void updater.settle();
    }, 850);
  }
  function activity() {
    quietUntil = Date.now() + 800;
    settleLater();
  }
  /** @param {PointerEvent} event */
  function down(event) {
    contacts.add(event.pointerId);
    activity();
  }
  /** @param {PointerEvent} event */
  function up(event) {
    contacts.delete(event.pointerId);
    activity();
  }
  /** @param {KeyboardEvent} event */
  function keydown(event) {
    keys.add(event.code);
    activity();
  }
  /** @param {KeyboardEvent} event */
  function keyup(event) {
    keys.delete(event.code);
    activity();
  }
  /** Pointer cancellation can hand a still-active touch to native scrolling. @param {TouchEvent} event */
  function touch(event) {
    touches = event.touches.length;
    activity();
  }
  function startComposition() {
    composing = true;
    activity();
  }
  function endComposition() {
    composing = false;
    activity();
  }
  function resetInput() {
    contacts.clear();
    touches = 0;
    keys.clear();
    composing = false;
    activity();
  }
  /** Descendant blur is a focus move, not the end of held input. @param {Event} event */
  function windowBlur(event) {
    if (event.target === window) resetInput();
  }
  function foreground() {
    if (!visible()) {
      resetInput();
      return;
    }
    void updater.check();
    settleLater();
  }
  /** @type {Array<[EventTarget, string, EventListener]>} */
  const listeners = [
    [window, "pointerdown", down],
    [window, "pointerup", up],
    [window, "pointercancel", up],
    [window, "touchstart", touch],
    [window, "touchend", touch],
    [window, "touchcancel", touch],
    [window, "keydown", keydown],
    [window, "keyup", keyup],
    [window, "compositionstart", startComposition],
    [window, "compositionend", endComposition],
    [window, "input", activity],
    [window, "click", activity],
    [window, "blur", windowBlur],
    [window, "focus", foreground],
    [window, "pageshow", foreground],
    [document, "visibilitychange", foreground],
  ];
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
  foreground();
  const idle = setInterval(() => {
    void updater.settle();
  }, 1000);
  return () => {
    updater.stop();
    clearInterval(idle);
    clearTimeout(timer);
    for (const [target, type, listener] of listeners)
      target.removeEventListener(type, listener, true);
  };
}
