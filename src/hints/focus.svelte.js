/** A temporary reading aid. It never changes the game's selection or pencil marks. */
export function createHintFocus() {
  let cell = $state(-1);
  let sequence = $state(0);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  function clear() {
    clearTimeout(timer);
    timer = undefined;
    cell = -1;
  }
  return {
    get cell() {
      return cell;
    },
    get sequence() {
      return sequence;
    },
    /** @param {number} target */
    flash(target) {
      if (!Number.isInteger(target) || target < 0 || target > 80) return;
      clear();
      cell = target;
      sequence++;
      timer = setTimeout(clear, 900);
    },
    clear,
  };
}
