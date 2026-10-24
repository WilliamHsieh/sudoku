import { createUpdater, probeDeployment } from "./auto-update.js";

const ATTEMPTS = "sudoku-update-attempts";
export const UPDATE_PARAM = "_sudoku_update";

/** Remove the navigation marker even if the check fails or storage is blocked. */
export function stripUpdateParam() {
  const url = new URL(location.href);
  if (url.searchParams.has(UPDATE_PARAM)) {
    url.searchParams.delete(UPDATE_PARAM);
    history.replaceState(history.state, "", url);
  }
}

/**
 * Called before mount. No player state is read or written.
 * @param {{ current: import('./auto-update.js').Build, base: string }} options
 * @returns {Promise<boolean>} whether navigation started
 */
export async function updateBeforeMount({ current, base }) {
  stripUpdateParam();
  try {
    const next = await probeDeployment(base, current, { verify: true });
    if (!next) return false;
    const attempts = JSON.parse(sessionStorage.getItem(ATTEMPTS) ?? "[]");
    if (!Array.isArray(attempts) || attempts.includes(next.version)) return false;
    const saved = JSON.stringify([...attempts, next.version]);
    sessionStorage.setItem(ATTEMPTS, saved);
    if (sessionStorage.getItem(ATTEMPTS) !== saved) return false;
    const url = new URL(location.href);
    url.searchParams.set(UPDATE_PARAM, next.version);
    location.replace(url.href);
    return true;
  } catch {
    // Offline, blocked storage or navigation: mount the current build.
    return false;
  }
}

/**
 * Lifecycle listeners only request a quiet notice. No focus or game callbacks.
 * @param {{ current: import('./auto-update.js').Build, base: string,
 * notify: (version: string) => void }} options
 */
export function installAutoUpdate(options) {
  const updater = createUpdater({
    current: options.current,
    probe: () => probeDeployment(options.base, options.current),
    visible: () => document.visibilityState === "visible",
    notify: options.notify,
  });
  function foreground() {
    if (document.visibilityState === "visible") void updater.check();
  }
  /** @param {PageTransitionEvent} event */
  function pageshow(event) {
    if (event.persisted) foreground();
  }
  document.addEventListener("visibilitychange", foreground);
  window.addEventListener("pageshow", pageshow);
  return () => {
    updater.stop();
    document.removeEventListener("visibilitychange", foreground);
    window.removeEventListener("pageshow", pageshow);
  };
}
