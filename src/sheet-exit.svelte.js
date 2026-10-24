import { flushSync, onDestroy } from "svelte";
import "./sheet-exit.css";

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

  onDestroy(reset);

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
    /** @param {{ centered?: boolean, dialog?: HTMLDialogElement, closeDialog?: () => void, viewport?: HTMLElement, scrim?: HTMLElement }} [options] */
    start(options = {}) {
      if (closing) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        flushSync(remove);
        return;
      }
      const { dialog, closeDialog, viewport, scrim } = options;
      if (
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
      if (dialog?.matches(":modal")) {
        if (closeDialog) closeDialog();
        else dialog.close();
        // Keep only an exit surface; show() would run dialog focus steps again.
        dialog.open = true;
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
