/* global createReleaseStore */
// Worker lifecycle never selects an app release. A fully prepared new document
// (initial install or explicit fresh recovery) and ACTIVATE may select it.
const scope = /** @type {ServiceWorkerGlobalScope} */ (globalThis);
const releases = createReleaseStore({ root: scope.registration.scope, caches, fetch });
let queue = Promise.resolve();
scope.addEventListener("install", (event) => event.waitUntil(scope.skipWaiting()));
scope.addEventListener("activate", (event) => event.waitUntil(scope.clients.claim()));
scope.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (!port || !event.source?.id) return;
  const source = event.source;
  const task = async () => {
    const { type, current, version } = event.data;
    if (type === "PREPARE") {
      let release = await releases.ready(current.version);
      if (!release) {
        release = await releases.manifest();
        if (release.version !== current.version || release.builtAt !== current.builtAt)
          throw new Error("The app changed. Reload Sudoku, then retry.");
      }
      await releases.stage(release);
      if (!(await releases.complete(release)))
        throw new Error("Saved puzzles are incomplete. Reconnect and retry.");
      await releases.pin(source.id, release.version);
      const active = await releases.active();
      // This document has already navigated to the newer shell and completed
      // bootstrap. Persist that choice so recovery cannot return to a broken
      // older release on the next offline launch. Existing tabs stay pinned.
      if (!active || release.builtAt > active.builtAt) await releases.activate(release.version);
      return (await releases.asset(release.version, release.bank.path)).json();
    }
    if (type === "STAGE") {
      const next = await releases.manifest();
      if (next.version === current.version || next.builtAt <= current.builtAt) return null;
      return releases.stage(next);
    }
    if (type === "ACTIVATE") return releases.activate(version);
    throw new Error("Unknown offline request");
  };
  // One staging/activation transaction per origin, including multiple tabs.
  const pending = queue.then(task);
  queue = pending.catch(() => {});
  event.waitUntil(
    pending.then(
      (value) => port.postMessage({ value }),
      (error) => port.postMessage({ error: error.message })
    )
  );
});
scope.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const root = new URL(scope.registration.scope);
  if (
    request.method !== "GET" ||
    url.origin !== root.origin ||
    !url.pathname.startsWith(root.pathname)
  )
    return;
  // Verification and deployment probes must always reach the network, even if
  // a request uses an otherwise cached URL. Never cache probe responses.
  if (
    url.searchParams.has("_sudoku_check") ||
    request.cache === "no-store" ||
    request.cache === "reload" ||
    url.pathname.endsWith("/version.json")
  )
    return;
  event.respondWith(
    (async () => {
      const path = url.pathname.slice(root.pathname.length);
      if (request.mode === "navigate") {
        const active = await releases.active();
        if (active) {
          await releases.pin(event.resultingClientId, active.version);
          const html = await releases.asset(active.version, "index.html");
          if (html) return html;
        }
        return fetch(request);
      }
      const pinned = await releases.pinned(event.clientId);
      if (pinned) {
        const response = await releases.asset(pinned.version, path);
        if (response) return response;
      }
      return fetch(request);
    })()
  );
});
