import { flushSync, onDestroy } from "svelte";
import "./sheet-exit.css";

/** @param {HTMLDialogElement} dialog */
function leaveTopLayer(dialog) {
  const parent = dialog.parentNode;
  if (!parent) return;
  const next = dialog.nextSibling;
  const { scrollTop, scrollLeft } = dialog;
  // Dialog removal clears :modal without close()/show() focus passes.
  dialog.remove();
  parent.insertBefore(dialog, next);
  dialog.scrollTop = scrollTop;
  dialog.scrollLeft = scrollLeft;
}

/** @param {() => void} remove */
export function createSheetExit(remove) {
  let closing = $state(false);
  let centered = $state(false);
  let scrimClip = $state("");
  let timer = 0;

  function reset() {
    window.clearTimeout(timer);
    closing = false;
    scrimClip = "";
  }

  function finish() {
    if (!closing) return;
    // iOS needs sheet/scrim removal and scroll unlock in the same paint.
    flushSync(() => {
      remove();
      reset();
    });
  }

  onDestroy(() => {
    if (closing) remove();
    reset();
  });

  return {
    get closing() {
      return closing;
    },
    get sheetStyle() {
      return closing
        ? `animation: ${centered ? "pop-out" : "sheet-down"} var(--motion) var(--ease-out) forwards`
        : undefined;
    },
    get scrimStyle() {
      return closing
        ? `pointer-events: auto; transition: none; animation: sheet-exit-fade var(--motion) var(--ease-out) forwards; ${scrimClip}`
        : undefined;
    },
    /** @param {{ centered?: boolean, dialog?: HTMLDialogElement, viewport?: HTMLElement, scrim?: HTMLElement }} [options] */
    start(options = {}) {
      if (closing) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const { dialog, viewport, scrim } = options;
      if (
        !reduced &&
        !options.centered &&
        viewport &&
        scrim &&
        getComputedStyle(viewport).transform !== "none"
      ) {
        const view = viewport.getBoundingClientRect();
        const overlay = scrim.getBoundingClientRect();
        const insets = [
          view.top - overlay.top,
          overlay.right - view.right,
          overlay.bottom - view.bottom,
          view.left - overlay.left,
        ].map((n) => Math.max(0, n));
        // Journal's transformed view contains its fixed scrim; match that coverage
        // when a native dialog's full-viewport scrim exits onto the page.
        if (insets.some((n) => n > 0))
          scrimClip = `clip-path: inset(${insets.map((n) => `${n}px`).join(" ")})`;
      }
      if (dialog?.matches(":modal")) leaveTopLayer(dialog);
      if (reduced) {
        flushSync(remove);
        return;
      }
      centered = options.centered ?? false;
      closing = true;
      timer = window.setTimeout(finish, 320);
    },
    /** @param {AnimationEvent} event */
    onanimationend(event) {
      if (event.target !== event.currentTarget || event.pseudoElement) return;
      if (!["sheet-down", "pop-out"].includes(event.animationName)) return;
      finish();
    },
    reset,
  };
}
