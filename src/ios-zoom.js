// iOS Safari can still double-tap-zoom despite touch-action: manipulation.
// Cancelling a single-finger touchend on the board and pad stops that zoom
// (and the synthesized click; selection runs on pointerdown). A document-level
// guard cancels the second tap of a quick double-tap everywhere else, and
// replays the click so rapid presses on enabled buttons still count.

const ZOOM_TAP_MS = 350;

export function installIosZoomGuards() {
  const opts = /** @type {AddEventListenerOptions} */ ({ passive: false });

  /** @param {TouchEvent} e */
  const preventSingleFinger = (e) => {
    if (e.touches.length === 0 && e.changedTouches.length === 1) e.preventDefault();
  };

  /** @param {TouchEvent} e */
  const preventKeyStart = (e) => {
    if (e.target instanceof Element && e.target.closest(".key")) e.preventDefault();
  };

  const board = document.querySelector(".board");
  const keypad = document.querySelector(".keypad");
  board?.addEventListener("touchend", preventSingleFinger, opts);
  keypad?.addEventListener("touchend", preventSingleFinger, opts);
  keypad?.addEventListener("touchstart", preventKeyStart, opts);

  let last = { t: -Infinity, x: 0, y: 0 };
  /** @param {TouchEvent} e */
  const secondTap = (e) => {
    if (e.touches.length || e.changedTouches.length !== 1) return;
    const { clientX: x, clientY: y } = e.changedTouches[0];
    const quick = e.timeStamp - last.t < ZOOM_TAP_MS && Math.hypot(x - last.x, y - last.y) < 40;
    last = { t: e.timeStamp, x, y };
    if (!quick || e.defaultPrevented) return;
    e.preventDefault();
    const btn = e.target instanceof Element ? e.target.closest("button") : null;
    if (btn && !btn.disabled) btn.click();
  };
  document.addEventListener("touchend", secondTap, opts);

  return () => {
    board?.removeEventListener("touchend", preventSingleFinger, opts);
    keypad?.removeEventListener("touchend", preventSingleFinger, opts);
    keypad?.removeEventListener("touchstart", preventKeyStart, opts);
    document.removeEventListener("touchend", secondTap, opts);
  };
}
