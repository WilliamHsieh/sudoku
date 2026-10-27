import { createUpdater, probeDeployment } from "./auto-update.js";

export const UPDATE_PARAM = "_sudoku_update";

/** Remove the navigation marker even if the check fails or storage is blocked. */
export function stripUpdateParam() {
  const url = new URL(location.href);
  if (url.searchParams.has(UPDATE_PARAM)) {
    url.searchParams.delete(UPDATE_PARAM);
    history.replaceState(history.state, "", url);
  }
}

/** Reload only after an explicit Update action, preserving the URL.
 * @param {string} version
 */
export function reloadForUpdate(version) {
  const url = new URL(location.href);
  url.searchParams.set(UPDATE_PARAM, version);
  location.replace(url.href);
}

/** Flush autosave before navigation; restore the action if navigation fails.
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
    probe: () => probeDeployment(options.base, options.current, { verify: true }),
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
