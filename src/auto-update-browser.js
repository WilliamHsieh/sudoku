import { stageUpdate, activateUpdate } from "../offline/client.js";
import { createUpdater } from "./auto-update.js";

export const UPDATE_PARAM = "_sudoku_update";
export const UPDATE_FLUSH_TIMEOUT_MS = 2000;

/** Remove the navigation marker even if the check fails or storage is blocked. */
export function stripUpdateParam() {
  const url = new URL(location.href);
  if (url.searchParams.has(UPDATE_PARAM) || url.searchParams.has("_sudoku_check")) {
    url.searchParams.delete(UPDATE_PARAM);
    url.searchParams.delete("_sudoku_check");
    history.replaceState(history.state, "", url);
  }
}

/** Reload only after an explicit Update action, preserving the URL.
 * @param {string} version
 */
export async function reloadForUpdate(version) {
  await activateUpdate(version);
  const url = new URL(location.href);
  url.searchParams.set(UPDATE_PARAM, version);
  location.replace(url.href);
}

/** Flush autosave before navigation; restore the action if navigation fails.
 * @param {{ flush: () => void | Promise<void>, reload: () => void, setUpdating: (value: boolean) => void, onError?: (message: string) => void }} options
 */
export function createUpdateAction({ flush, reload, setUpdating, onError = () => {} }) {
  let busy = false;
  // A successful async update stays in flight until navigation leaves this page.
  let pending = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let flushTimer;
  return {
    run() {
      if (busy || pending) return;
      busy = true;
      setUpdating(true);
      timer = setTimeout(() => {
        busy = false;
        setUpdating(false);
      }, 3000);
      try {
        const saved = flush();
        const navigate = () =>
          Promise.resolve(reload()).catch((error) => {
            pending = false;
            onError(error.message || "Could not update. Please retry.");
          });
        // Preserve the synchronous legacy path. Bank writes can wait on a Web Lock.
        if (saved) {
          pending = true;
          const deadline = new Promise((resolve) => {
            flushTimer = setTimeout(() => resolve(undefined), UPDATE_FLUSH_TIMEOUT_MS);
          });
          Promise.race([saved, deadline])
            .then(() => {
              clearTimeout(flushTimer);
              return navigate();
            })
            .catch((error) => {
              clearTimeout(flushTimer);
              pending = false;
              onError(error.message || "Could not save progress. Please retry.");
            });
        } else void navigate();
      } catch (error) {
        onError(error.message || "Could not save progress. Please retry.");
        // Keep Updating… until the same three-second recovery deadline.
      }
    },
    stop() {
      clearTimeout(timer);
      clearTimeout(flushTimer);
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
    probe: () => stageUpdate(options.current),
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
