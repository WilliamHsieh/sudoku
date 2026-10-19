// Pure keypad-gesture and undo-ring timing. No DOM.
// Thresholds match prototype/mobile-input at 8226f21.

export const TAP_MAX_TRAVEL = 8;
export const TAP_MAX_MS = 500;
export const ARM_PX = 28;
export const DISARM_PX = 22;
export const FLY_MS = 260;
export const RETURN_MS = 200;
export const DOUBLE_TAP_MS = 300;
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Undo/redo ring timings (ms). Rapid repeats run at half speed. */
export const RING = {
  near: 300,
  far: 450,
  inPlace: 150,
  apply: 200,
  fade: 250,
  rapidGap: 400,
  still: 600,
};

const MAX_DIST = Math.hypot(8, 8);

/**
 * Vertical rubber-band of a swipe-up, in pixels of visual lift.
 * @param {number} dy distance dragged up (positive = up)
 */
export function rubberBand(dy) {
  if (dy <= 0) return -Math.min(12, -dy * 0.25);
  if (dy <= ARM_PX) return dy * 0.85;
  const over = dy - ARM_PX;
  const dim = 120;
  return ARM_PX * 0.85 + (over * 0.55 * dim) / (dim + 0.55 * over);
}

/**
 * @param {{ maxTravel: number, elapsed: number, cancelled?: boolean }} g
 */
export function isTap(g) {
  return !g.cancelled && g.maxTravel < TAP_MAX_TRAVEL && g.elapsed < TAP_MAX_MS;
}

/**
 * Arm/disarm with hysteresis: arm at ARM_PX, disarm below DISARM_PX.
 * @param {boolean} armed
 * @param {number} up pixels dragged up
 * @param {boolean} canNote whether a candidate gesture is possible
 */
export function nextArmed(armed, up, canNote) {
  if (!canNote) return false;
  if (!armed && up >= ARM_PX) return true;
  if (armed && up < DISARM_PX) return false;
  return armed;
}

/** Start lifting once the drag is clearly upward. */
export function shouldLift(up, dx) {
  return up > TAP_MAX_TRAVEL && up > Math.abs(dx) * 0.75;
}

/**
 * @typedef {{ i: number, t: number, hl: number }} DoubleTap
 */

const IDLE_TAP = { i: -1, t: -Infinity, hl: 0 };

/**
 * Second tap on the same cell within DOUBLE_TAP_MS is a fill gesture.
 * `highlighted` is the digit that was selected before this tap.
 * @param {DoubleTap} last
 * @param {number} i
 * @param {number} now
 * @param {number} highlighted
 */
export function nextDoubleTap(last, i, now, highlighted) {
  const isDouble = last.i === i && now - last.t <= DOUBLE_TAP_MS;
  return {
    isDouble,
    highlighted: last.hl,
    next: isDouble ? { ...IDLE_TAP } : { i, t: now, hl: highlighted },
  };
}

/**
 * @param {number} from cell index
 * @param {number} to cell index
 * @param {boolean} [rapid]
 */
export function ringTiming(from, to, rapid = false) {
  const dist = Math.hypot(Math.floor(from / 9) - Math.floor(to / 9), (from % 9) - (to % 9));
  const travel =
    dist === 0 ? RING.inPlace : RING.near + ((RING.far - RING.near) * (dist - 1)) / (MAX_DIST - 1);
  const k = rapid ? 0.5 : 1;
  return { dist, travel: Math.round(travel * k), apply: RING.apply * k, fade: RING.fade * k };
}
