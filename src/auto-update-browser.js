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

const PENDING = "sudoku-pending-update";

/** Navigate once per build per tab, preserving the URL and cache-busting marker.
 * @param {string} version
 */
export function reloadForUpdate(version) {
  try {
    const attempts = JSON.parse(sessionStorage.getItem(ATTEMPTS) ?? "[]");
    if (!Array.isArray(attempts) || attempts.includes(version)) return false;
    const saved = JSON.stringify([...attempts, version]);
    sessionStorage.setItem(ATTEMPTS, saved);
    if (sessionStorage.getItem(ATTEMPTS) !== saved) return false;
    const url = new URL(location.href);
    url.searchParams.set(UPDATE_PARAM, version);
    location.replace(url.href);
    return true;
  } catch {
    return false;
  }
}

/** Revalidate a staged deployment after mount before applying it on launch.
 * @param {import('./auto-update.js').Build} current
 * @param {string} [base]
 */
export async function applyPendingUpdate(current, base = import.meta.env.BASE_URL) {
  stripUpdateParam();
  try {
    const next = JSON.parse(localStorage.getItem(PENDING) ?? "null");
    if (
      !next ||
      typeof next.version !== "string" ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(next.version) ||
      !Number.isSafeInteger(next.builtAt) ||
      next.builtAt <= current.builtAt ||
      next.version === current.version
    )
      return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    const reachable = await probeDeployment(base, current, { verify: true });
    if (!reachable || reachable.version !== next.version || reachable.builtAt < next.builtAt)
      return false;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
    return reloadForUpdate(next.version);
  } catch {
    return false;
  }
}

/** Flush and save before navigation; restore the action if navigation fails.
 * @param {{ flush: () => void, reload: () => void, setUpdating: (value: boolean) => void }} options
 */
export function createUpdateAction({ flush, reload, setUpdating }) {
  let busy = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return {
    run() {
      if (busy) return;
      busy = true;
      setUpdating(true);
      timer = setTimeout(() => {
        busy = false;
        setUpdating(false);
      }, 3000);
      try {
        flush();
        reload();
      } catch {
        // Keep Updating… until the same three-second recovery deadline.
      }
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

/**
 * Lifecycle listeners only request a quiet notice. No focus or game callbacks.
 * @param {{ current: import('./auto-update.js').Build, base: string,
 * notify: (version: string) => void }} options
 */
export function installAutoUpdate(options) {
  const updater = createUpdater({
    current: options.current,
    probe: async () => {
      const next = await probeDeployment(options.base, options.current, { verify: true });
      if (next) {
        try {
          const pending = JSON.parse(localStorage.getItem(PENDING) ?? "null");
          if (!pending || pending.builtAt < next.builtAt) {
            localStorage.setItem(
              PENDING,
              JSON.stringify({ version: next.version, builtAt: next.builtAt })
            );
          }
        } catch {
          // The notice and explicit Update still work with blocked storage.
        }
      }
      return next;
    },
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
  foreground();
  return () => {
    updater.stop();
    document.removeEventListener("visibilitychange", foreground);
    window.removeEventListener("pageshow", pageshow);
  };
}
