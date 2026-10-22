import { MONTHS, parseDay, shortDate } from "./format.js";

/** @param {Date} view @param {string} latest */
export function monthsToLatest(view, latest) {
  const home = parseDay(latest);
  return (home.getFullYear() - view.getFullYear()) * 12 + home.getMonth() - view.getMonth();
}

/** @param {Date} view @param {string | null} selected @param {string} latest @param {boolean} mobile */
export function isAway(view, selected, latest, mobile) {
  return (
    monthsToLatest(view, latest) !== 0 || (!mobile && selected !== null && selected !== latest)
  );
}

/** @param {string} latest */
export function latestAnnouncement(latest) {
  const home = parseDay(latest);
  return `${MONTHS[home.getMonth()]} ${home.getFullYear()}, latest puzzles ${shortDate(latest)}`;
}

/** @param {KeyboardEvent} event */
export function isTodayShortcut(event) {
  const target = event.target;
  return (
    event.key.toLowerCase() === "t" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.isComposing &&
    !(
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
    )
  );
}
