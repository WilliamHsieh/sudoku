/** @typedef {{ version: string, builtAt: number }} Build */

/**
 * A check never navigates on failure. A deferred update is probed again because
 * a deployment can change while a finger is down or the page is hidden.
 * @param {{ current: Build, probe: () => Promise<Build | null>,
 * persist: (version: string) => boolean, navigate: (version: string) => void,
 * visible: () => boolean, busy: () => boolean,
 * wasAttempted: (version: string) => boolean,
 * markAttempted: (version: string) => boolean }} options
 */
export function createUpdater(options) {
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let pending = false;
  let lastCheck = -Infinity;
  let navigated = false;

  async function run(force = false) {
    if (stopped || navigated || !options.visible()) return;
    if (!force && Date.now() - lastCheck < 30_000) return;
    if (inFlight) {
      queued = true;
      return;
    }
    lastCheck = Date.now();
    inFlight = true;
    pending = false;
    try {
      const next = await options.probe();
      if (
        stopped ||
        !next ||
        next.version === options.current.version ||
        next.builtAt <= options.current.builtAt ||
        options.wasAttempted(next.version)
      )
        return;
      if (!options.visible() || options.busy()) {
        pending = true;
        return;
      }
      // All remaining work is synchronous: input cannot interleave with the save.
      if (!options.persist(next.version) || !options.markAttempted(next.version)) return;
      navigated = true;
      options.navigate(next.version);
    } catch {
      // Offline, aborted, invalid deployment, or storage unavailable: keep playing.
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        void run();
      }
    }
  }

  return {
    check: () => run(),
    settle: () => (pending && !options.busy() ? run(true) : Promise.resolve()),
    stop: () => {
      stopped = true;
    },
  };
}

/** @param {ArrayBuffer} bytes */
async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate the actual document and every executable/style asset, not just a
 * version string. A 404 rewritten to HTML or a mixed Pages deployment is unsafe.
 * @param {string} base
 * @param {Build} current
 * @returns {Promise<Build | null>}
 */
export async function probeDeployment(base, current) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const root = new URL(base, location.href);
  const nonce = `${Date.now()}-${Math.random()}`;
  /** @param {string} path */
  async function read(path) {
    const url = new URL(path, root);
    url.searchParams.set("_sudoku_check", nonce);
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("Deployment unavailable");
    return response;
  }
  try {
    const manifest = await (await read("version.json")).json();
    if (
      manifest.schema !== 1 ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(manifest.version) ||
      !Number.isSafeInteger(manifest.builtAt) ||
      manifest.builtAt <= current.builtAt ||
      manifest.version === current.version ||
      !Array.isArray(manifest.assets) ||
      !manifest.assets.length ||
      manifest.assets.length > 100 ||
      !/^[a-f0-9]{64}$/.test(manifest.html)
    )
      return null;
    const html = await read("index.html");
    if ((await digest(await html.arrayBuffer())) !== manifest.html) return null;
    for (const asset of manifest.assets) {
      if (
        !/^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(asset.path) ||
        !/^[a-f0-9]{64}$/.test(asset.hash)
      )
        return null;
      const response = await read(asset.path);
      if ((await digest(await response.arrayBuffer())) !== asset.hash) return null;
    }
    const latest = await (await read("version.json")).json();
    if (JSON.stringify(latest) !== JSON.stringify(manifest)) return null;
    return manifest;
  } finally {
    clearTimeout(timeout);
  }
}
