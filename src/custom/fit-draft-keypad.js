/** Return the square size while preserving a usable minimum on short screens.
 * @param {number} width
 * @param {number} available
 */
export function pasteBoardSide(width, available) {
  return Math.floor(Math.max(200, Math.min(width, available)));
}

/** @typedef {{mode: string, preview: boolean}} DraftView */

/**
 * Fit the editor's keypad at 90%, down to 70% on short screens, before
 * reducing the square board. Measure the unscaled grid to avoid feedback.
 * @param {HTMLElement} editor
 * @param {DraftView} view
 */
export function fitDraftKeypad(editor, view) {
  const compact = window.matchMedia("(max-width: 599px)");
  const properties = ["--draft-keypad-scale", "--draft-keypad-height", "--draft-board-side"];
  let frame = 0;
  let refresh = true;
  let destroyed = false;
  const observer = new ResizeObserver(schedule);

  function reset() {
    for (const property of properties) editor.style.removeProperty(property);
  }

  function schedule() {
    if (destroyed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (refresh) {
        observer.disconnect();
        for (const element of [
          editor,
          ...editor.querySelectorAll(
            ".editor-body,.setup-top,.board-area,.input-keypad,.editor-tools"
          ),
        ]) {
          if (element instanceof HTMLElement) observer.observe(element, { box: "border-box" });
        }
        refresh = false;
      }
      fit();
    });
  }

  function fit() {
    if (!compact.matches || view.preview) {
      reset();
      return;
    }
    const body = editor.querySelector(".editor-body");
    const setup = editor.querySelector(".setup-top");
    const boardArea = editor.querySelector(".board-area");
    const board = editor.querySelector(".input-board");
    if (view.mode === "paste") {
      if (
        !(body instanceof HTMLElement) ||
        !(boardArea instanceof HTMLElement) ||
        !(board instanceof HTMLElement)
      ) {
        reset();
        return;
      }
      // The input can grow for validation messages. Preserve the footer and allow
      // body scrolling below a usable minimum instead of shrinking cells forever.
      const available =
        body.getBoundingClientRect().bottom -
        board.getBoundingClientRect().top +
        body.scrollTop -
        40;
      const side = pasteBoardSide(boardArea.clientWidth, available);
      editor.style.removeProperty(properties[0]);
      editor.style.removeProperty(properties[1]);
      const value = `${side}px`;
      if (editor.style.getPropertyValue(properties[2]) !== value)
        editor.style.setProperty(properties[2], value);
      return;
    }
    const panel = editor.querySelector(".keypad-panel");
    const slot = editor.querySelector(".draft-keypad-slot");
    const keypad = editor.querySelector(".input-keypad");
    if (
      !(body instanceof HTMLElement) ||
      !(setup instanceof HTMLElement) ||
      !(boardArea instanceof HTMLElement) ||
      !(board instanceof HTMLElement) ||
      !(panel instanceof HTMLElement) ||
      !(slot instanceof HTMLElement) ||
      !(keypad instanceof HTMLElement) ||
      !keypad.offsetHeight
    ) {
      reset();
      return;
    }

    const style = getComputedStyle(body);
    const fixed =
      setup.getBoundingClientRect().height +
      boardArea.getBoundingClientRect().height -
      board.getBoundingClientRect().height +
      panel.getBoundingClientRect().height -
      slot.getBoundingClientRect().height +
      parseFloat(style.rowGap) * 2 +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom);
    const room = body.clientHeight - fixed - boardArea.clientWidth;
    const scale = Math.min(0.9, Math.max(0.7, room / keypad.offsetHeight));
    const height = keypad.offsetHeight * scale;
    const side = Math.max(160, Math.min(boardArea.clientWidth, body.clientHeight - fixed - height));
    for (const [property, value] of [
      [properties[0], String(scale)],
      [properties[1], `${height}px`],
      [properties[2], `${side}px`],
    ]) {
      if (editor.style.getPropertyValue(property) !== value)
        editor.style.setProperty(property, value);
    }
  }

  compact.addEventListener("change", schedule);
  schedule();
  return {
    /** @param {DraftView} next */
    update(next) {
      view = next;
      refresh = true;
      schedule();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      compact.removeEventListener("change", schedule);
      reset();
    },
  };
}
