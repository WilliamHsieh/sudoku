/** @typedef {{pointerId: number, x: number, y: number, time: number, stage: number, allowed: boolean}} StoryPress */

/**
 * Recognize a short stationary press without taking over native text selection
 * or scrolling. Callers cancel on scroll, pointer cancellation, or stage changes.
 */
export function createHintStoryGesture() {
  /** @type {StoryPress | null} */
  let press = null;
  const moved = (x, y) => !press || Math.hypot(x - press.x, y - press.y) > 8;
  return {
    /** @param {StoryPress} start */
    start(start) {
      press = start.allowed ? start : null;
    },
    /** @param {number} pointerId @param {number} x @param {number} y */
    move(pointerId, x, y) {
      if (press && (pointerId !== press.pointerId || moved(x, y))) press = null;
    },
    cancel() {
      press = null;
    },
    /**
     * @param {StoryPress & {left: number, top: number, width: number, height: number}} end
     * @returns {-1 | 0 | 1}
     */
    finish(end) {
      const start = press;
      const didMove = moved(end.x, end.y);
      press = null;
      if (
        !start ||
        !end.allowed ||
        start.pointerId !== end.pointerId ||
        start.stage !== end.stage ||
        end.time < start.time ||
        end.time - start.time > 500 ||
        didMove ||
        end.width <= 0 ||
        end.height <= 0 ||
        end.x < end.left ||
        end.x >= end.left + end.width ||
        end.y < end.top ||
        end.y >= end.top + end.height
      )
        return 0;
      const direction = end.x < end.left + end.width / 2 ? -1 : 1;
      return end.stage + direction >= 0 && end.stage + direction <= 2 ? direction : 0;
    },
  };
}
