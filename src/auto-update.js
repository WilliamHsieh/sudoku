/** @typedef {{ version: string, builtAt: number }} Build */

/**
 * Foreground checks only notify. They cannot navigate or change game state.
 * @param {{ current: Build, probe: () => Promise<Build | null>,
 * visible: () => boolean, notify: (version: string) => void }} options
 */
export function createUpdater(options) {
  let stopped = false;
  let inFlight = false;
  let lastCheck = -Infinity;
  const shown = new Set();
  let newestBuiltAt = options.current.builtAt;
  return {
    async check() {
      if (stopped || inFlight || !options.visible() || Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      inFlight = true;
      try {
        const next = await options.probe();
        if (
          stopped ||
          !options.visible() ||
          !next ||
          next.version === options.current.version ||
          next.builtAt <= newestBuiltAt ||
          shown.has(next.version)
        )
          return;
        shown.add(next.version);
        newestBuiltAt = next.builtAt;
        options.notify(next.version);
      } catch {
        // An unavailable deployment leaves the current app usable.
      } finally {
        inFlight = false;
      }
    },
    stop() {
      stopped = true;
    },
  };
}
