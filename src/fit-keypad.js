/**
 * Fit the compact play layout without taking space from a full-width board
 * until the keypad has reached 70%. Observe unscaled boxes so changing the
 * keypad transform cannot feed back into its own measurements.
 * @param {HTMLElement} play
 */
export function fitKeypad(play) {
  const board = play.querySelector(".board-slot");
  const chrome = play.querySelector(".mobile-chrome");
  const slot = play.querySelector(".keypad-slot");
  const keypad = play.querySelector(".keypad");
  if (
    !(board instanceof HTMLElement) ||
    !(chrome instanceof HTMLElement) ||
    !(slot instanceof HTMLElement) ||
    !(keypad instanceof HTMLElement)
  ) {
    return;
  }
  const compact = window.matchMedia("(max-width: 599px)");

  const fit = () => {
    if (!compact.matches) {
      play.style.removeProperty("--keypad-scale");
      play.style.removeProperty("--keypad-height");
      return;
    }
    const height = keypad.offsetHeight;
    if (!height) return;
    const style = getComputedStyle(play);
    const available =
      play.getBoundingClientRect().height -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    const otherChrome = chrome.getBoundingClientRect().height - slot.getBoundingClientRect().height;
    const room =
      available - board.getBoundingClientRect().width - parseFloat(style.rowGap) - otherChrome;
    const scale = Math.min(0.9, Math.max(0.7, room / height));
    play.style.setProperty("--keypad-scale", String(scale));
    play.style.setProperty("--keypad-height", `${height * scale}px`);
  };

  const observer = new ResizeObserver(fit);
  for (const element of [play, keypad, ...chrome.querySelectorAll(".tools, .hint-line")]) {
    observer.observe(element, { box: "border-box" });
  }
  compact.addEventListener("change", fit);
  fit();
  return {
    destroy() {
      observer.disconnect();
      compact.removeEventListener("change", fit);
    },
  };
}
