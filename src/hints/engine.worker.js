import { findHint } from "./engine.js";
import { hintStateKey } from "./hint.js";
self.onmessage = ({ data }) => {
  const { id, key, state } = data;
  try {
    if (key !== hintStateKey(state)) throw new Error("Snapshot fingerprint mismatch");
    const hint = findHint(state);
    self.postMessage({ id, key, hint });
  } catch (error) {
    self.postMessage({ id, key, error: error instanceof Error ? error.message : "Hint failed" });
  }
};
