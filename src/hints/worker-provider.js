import { hintSnapshot, hintStateKey } from "./hint.js";
import { registerVerifiedHint } from "./certificates.js";
/** A request owns its Worker. Abort/timeout terminates even non-yielding search.
 * No background search, no worker is kept alive while the hint is closed.
 * @param {{makeWorker?:()=>Worker, timeoutMs?:number}} [options]
 * @returns {import('./hint.js').HintProvider}
 */
export function createWorkerHintProvider({
  makeWorker = () => new Worker(new URL("./engine.worker.js", import.meta.url), { type: "module" }),
  timeoutMs = 3000,
} = {}) {
  let sequence = 0;
  return (state, { signal }) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const id = ++sequence,
        snapshot = hintSnapshot(state),
        key = hintStateKey(snapshot);
      const worker = makeWorker();
      let settled = false;
      /** @param {Error|null} error @param {import('./hint.js').Hint|null} [hint] */
      const finish = (error, hint = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        worker.terminate();
        if (error) reject(error);
        else {
          if (hint) registerVerifiedHint(hint, key);
          resolve(hint);
        }
      };
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("Hint search timed out")), timeoutMs);
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = ({ data }) => {
        if (data.id !== id || data.key !== key) return;
        finish(data.error ? new Error(data.error) : null, data.hint);
      };
      worker.onerror = () => finish(new Error("Hint worker failed"));
      worker.onmessageerror = () => finish(new Error("Invalid hint worker response"));
      try {
        worker.postMessage({ id, key, state: snapshot });
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Cannot start hint worker"));
      }
    });
}
