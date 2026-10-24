import { flushSync, onDestroy } from "svelte";
import "./sheet-exit.css";

/** @param {() => void} remove */
export function createSheetExit(remove) {
  let closing = $state(false);
  let centered = $state(false);
  let timer = 0;

  function reset() {
    window.clearTimeout(timer);
    closing = false;
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
        ? "pointer-events: auto; transition: none; animation: sheet-exit-fade var(--motion) var(--ease-out) forwards"
        : undefined;
    },
    /** @param {{ centered?: boolean, dialog?: HTMLDialogElement, closeDialog?: () => void }} [options] */
    start(options = {}) {
      if (closing) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        flushSync(remove);
        return;
      }
      const { dialog, closeDialog } = options;
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
