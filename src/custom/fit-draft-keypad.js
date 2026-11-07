/** Return the square size while preserving a usable minimum on short screens.
 * @param {number} width
 * @param {number} available
 */
export function draftBoardSide(width, available) {
  return Math.floor(Math.max(160, Math.min(width, available)));
}

/** @typedef {{preview: boolean}} DraftView */

/**
 * Fit both input modes together. Their shared grid track always measures the
 * larger panel, including hidden controls and validation text. A mode switch
 * changes visibility only, so it cannot move the board or footer.
 * @param {HTMLElement} editor
 * @param {DraftView} view
 */
export function fitDraftKeypad(editor, view) {
  const viewport = window.visualViewport;
  const compact = window.matchMedia("(max-width: 599px)");
  const properties = [
    "--draft-keypad-scale",
    "--draft-keypad-height",
    "--draft-board-side",
    "--draft-viewport-height",
  ];
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
            ".editor-body,.setup-top,.board-area,.input-region,.manual-input,.paste-input,.input-keypad,.board-error"
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
    // iOS overlays its keyboard without shrinking the layout viewport/dvh.
    // Bound the editor to the visible viewport; its body can then scroll while
    // Start remains reachable. Do not resize for ordinary browser chrome.
    if (viewport && window.innerHeight - viewport.height > 100) {
      const bottom = parseFloat(getComputedStyle(editor.closest("main")).paddingBottom);
      const height = Math.max(
        120,
        viewport.height + viewport.offsetTop - editor.getBoundingClientRect().top - bottom
      );
      editor.style.setProperty(properties[3], `${height}px`);
    } else {
      editor.style.removeProperty(properties[3]);
    }
    const body = editor.querySelector(".editor-body");
    const setup = editor.querySelector(".setup-top");
    const boardArea = editor.querySelector(".board-area");
    const region = editor.querySelector(".input-region");
    const manual = editor.querySelector(".manual-input");
    const paste = editor.querySelector(".paste-input");
    const slot = editor.querySelector(".draft-keypad-slot");
    const keypad = editor.querySelector(".input-keypad");
    const error = editor.querySelector(".board-error");
    if (
      !(keypad instanceof HTMLElement) ||
      ![body, setup, boardArea, region, manual, paste, slot, keypad, error].every(
        (element) => element instanceof HTMLElement
      )
    )
      return;

    const rect = (element) => element.getBoundingClientRect();
    const style = getComputedStyle(body);
    const fixed =
      rect(setup).height +
      rect(error).height +
      parseFloat(style.rowGap) * (rect(error).height ? 3 : 2) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom);
    const manualFixed = rect(manual).height - rect(slot).height;
    const available = body.clientHeight - fixed;
    const scale = Math.min(
      0.9,
      Math.max(0.7, (available - boardArea.clientWidth - manualFixed) / keypad.offsetHeight)
    );
    const height = keypad.offsetHeight * scale;
    const inputHeight = Math.max(manualFixed + height, rect(paste).height);
    const side = draftBoardSide(boardArea.clientWidth, available - inputHeight);
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
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
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
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      reset();
    },
  };
}
