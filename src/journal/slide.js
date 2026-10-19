/** Duration of a committed month slide. Drag snap-back stays on the grid's own transition. */
export const SLIDE_MS = 300;

/** Matches the journal ease. No overshoot. */
export const SLIDE_EASE = "cubic-bezier(.22,.8,.24,1)";

/**
 * Offsets for a dual-grid track inside a viewport of `width` px.
 * Previous (`dir < 0`) places the incoming month on the left; next places it on the right.
 * `fromPx` is a drag already applied to the outgoing month so the slide continues from the finger.
 * @param {number} dir
 * @param {number} width
 * @param {number} [fromPx]
 * @returns {{ start: number, end: number }}
 */
export function slideOffsets(dir, width, fromPx = 0) {
  const start = dir < 0 ? -width + fromPx : fromPx;
  const end = dir < 0 ? 0 : -width;
  return { start, end };
}
