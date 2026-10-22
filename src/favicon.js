/** @typedef {16 | 32} FaviconSize */

/**
 * Local weekday as a digit. Monday is 1 and Sunday is 7.
 * @param {Date} date
 * @returns {number}
 */
export function weekdayDigit(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Public URL for one tab icon. `base` is Vite's BASE_URL (`/sudoku/`).
 * @param {number} digit
 * @param {FaviconSize} size
 * @param {string} base
 * @returns {string}
 */
export function faviconPath(digit, size, base) {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}favicon/I${digit}-${size}.svg`;
}

/**
 * Milliseconds from `date` until the next local midnight.
 * @param {Date} date
 * @returns {number}
 */
function msUntilLocalMidnight(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return next.getTime() - date.getTime();
}

/**
 * Point the 16 and 32 tab icons at the weekday digit for `date`.
 * The apple-touch icon is static and stays on 7.
 * @param {Document} doc
 * @param {Date} date
 * @param {string} [base]
 */
export function applyWeekdayFavicon(doc, date, base = "/") {
  const digit = weekdayDigit(date);
  const sizes = /** @type {const} */ ([16, 32]);
  for (const size of sizes) {
    const link = /** @type {HTMLLinkElement | null} */ (
      doc.querySelector(`link[rel="icon"][sizes="${size}x${size}"]`)
    );
    if (link) link.href = faviconPath(digit, size, base);
  }
}

/**
 * Show today's local weekday on the tab icon.
 * Updates on load, when the page becomes visible, and at the next local midnight.
 * @param {Document} doc
 * @param {string} [base]
 * @param {() => Date} [now]
 * @returns {() => void} stop the midnight timer and the visibility listener
 */
export function watchWeekdayFavicon(doc, base = "/", now = () => new Date()) {
  const apply = () => applyWeekdayFavicon(doc, now(), base);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const scheduleMidnight = () => {
    const delay = Math.max(0, msUntilLocalMidnight(now()));
    timer = setTimeout(() => {
      apply();
      scheduleMidnight();
    }, delay);
  };

  const onVisibility = () => {
    if (doc.visibilityState === "visible") apply();
  };

  apply();
  doc.addEventListener("visibilitychange", onVisibility);
  scheduleMidnight();

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
