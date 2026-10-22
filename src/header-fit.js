/**
 * Mobile header steps below 390. Text stays only when the rendered Journal
 * and Play labels fit beside the reserved "999:59" slot with `gap` px free.
 * The brand stays only when it fits in that same slack. Inputs are measured
 * widths, so a wider face crosses the step sooner and a ticking clock never
 * enters the decision.
 *
 * @typedef {{
 *   content: number,
 *   brand: number,
 *   time: number,
 *   timerChrome: number,
 *   pause: number,
 *   trackGap: number,
 *   trackPad: number,
 *   iconTrackPad: number,
 *   segPad: number,
 *   journal: number,
 *   play: number,
 *   iconFace: number,
 *   gap: number,
 * }} FitInput
 */

/**
 * @param {FitInput} m
 */
export function headerStep(m) {
  const slot = Math.ceil(m.time);
  const journal = Math.ceil(m.journal);
  const play = Math.ceil(m.play);
  const brand = Math.ceil(m.brand);
  const textTrack = Math.ceil(2 * m.trackPad + 4 * m.segPad + journal + play);
  const iconPad = m.iconTrackPad ?? m.trackPad;
  const iconTrack = 2 * iconPad + 2 * m.iconFace;
  const textCluster = m.timerChrome + slot + m.pause + m.trackGap + textTrack;
  const iconCluster = m.timerChrome + slot + m.pause + m.trackGap + iconTrack;
  const icons = m.content + 0.01 < textCluster + m.gap;
  const brandHidden = icons || m.content + 0.01 < textCluster + brand + m.gap;
  return { icons, brandHidden, slot, textCluster, iconCluster };
}

/** Structural width of the timer around its label. Independent of the clock text. */
let timerChrome = 39;

/**
 * @param {HTMLElement} timer
 */
function measureChrome(timer) {
  const cs = getComputedStyle(timer);
  const gap = parseFloat(cs.columnGap || cs.gap || "");
  const icon = timer.querySelector(".ic");
  return (
    parseFloat(cs.paddingLeft) +
    parseFloat(cs.paddingRight) +
    parseFloat(cs.borderLeftWidth) +
    parseFloat(cs.borderRightWidth) +
    (Number.isFinite(gap) ? gap : 6) +
    (icon ? icon.getBoundingClientRect().width : 15)
  );
}

/**
 * Read the live header. Label and slot widths come from probes, so hiding
 * the brand or the labels cannot change the next answer.
 * @param {HTMLElement} hd
 * @returns {FitInput}
 */
export function readHeaderFit(hd) {
  const cs = getComputedStyle(hd);
  const probe = (sel) => {
    const el = hd.querySelector(sel);
    return el ? el.getBoundingClientRect().width : 0;
  };
  const pad = getComputedStyle(hd.querySelector(".hd-probe-pad"));
  const timer = hd.querySelector(".timer2");
  if (timer instanceof HTMLElement) timerChrome = measureChrome(timer);
  const num = (name) => parseFloat(cs.getPropertyValue(name));
  return {
    content: hd.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    brand: probe(".hd-probe-brand"),
    time: probe(".hd-probe-time"),
    timerChrome,
    pause: num("--pause-hit"),
    trackGap: num("--track-gap"),
    trackPad: num("--track-pad"),
    iconTrackPad: num("--icon-track-pad"),
    segPad: parseFloat(pad.paddingLeft),
    journal: probe(".hd-probe-journal"),
    play: probe(".hd-probe-play"),
    iconFace: parseFloat(pad.width),
    gap: num("--fit-gap"),
  };
}
