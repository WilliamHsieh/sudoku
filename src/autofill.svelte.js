// Transient pass feedback. Answers and undo history stay in the game core.
export const autofill = $state({
  /** @type {{i: number, d: number}[]} */
  placed: [],
  /** @type {number[]} */
  skipped: [],
  /** @type {number[]} */
  undone: [],
  reduced: false,
});
/** @type {WeakMap<readonly number[], {i: number, d: number}[]>} */
let lastPass = new WeakMap();
/** @type {readonly number[]} */
let previous = [];
let cleanup = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);

export function clearAutofill() {
  clearTimeout(cleanup);
  autofill.placed = [];
  autofill.skipped = [];
  autofill.undone = [];
}

/** @param {{placed: {i: number, d: number}[], skipped: number[]}} result
 * @param {readonly number[]} answers @param {boolean} reduced */
export function animateAutofill(result, answers, reduced) {
  clearAutofill();
  if (result.placed.length) lastPass.set(answers, result.placed);
  previous = answers;
  autofill.placed = result.placed;
  autofill.skipped = result.skipped;
  autofill.reduced = reduced;
  cleanup = setTimeout(clearAutofill, 1560);
}

/** Observe history changes so Undo adds a ring on every restored cell.
 * @param {readonly number[]} answers */
export function syncAutofill(answers) {
  const undone = (lastPass.get(previous) ?? []).filter(
    ({ i, d }) => previous[i] === d && answers[i] === 0
  );
  previous = answers;
  if (!undone.length) return;
  clearAutofill();
  autofill.undone = undone.map(({ i }) => i);
  cleanup = setTimeout(clearAutofill, 900);
}

export function resetAutofill() {
  clearAutofill();
  lastPass = new WeakMap();
  previous = [];
}
