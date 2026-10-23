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
          next.builtAt <= options.current.builtAt ||
          shown.has(next.version)
        )
          return;
        shown.add(next.version);
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

/** @param {ArrayBuffer} bytes */
async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

/**
 * A single deadline covers fetches, response bodies and hashes. Verification is
 * for cold launch only; foreground checks need only the validated manifest.
 * @param {string} base
 * @param {Build} current
 * @param {{ verify?: boolean, budgetMs?: number }} [options]
 * @returns {Promise<Build | null>}
 */
export async function probeDeployment(base, current, { verify = false, budgetMs = 1500 } = {}) {
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, budgetMs);
  });
  const root = new URL(base, location.href);
  const nonce = `${Date.now()}-${Math.random()}`;
  /** @param {string} path @param {boolean} [asset] */
  async function read(path, asset = false) {
    const url = new URL(path, root);
    if (!asset) url.searchParams.set("_sudoku_check", nonce);
    const response = await fetch(url, {
      cache: asset ? "reload" : "no-store",
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("Deployment unavailable");
    return response;
  }
  async function probe() {
    const manifest = await (await read("version.json")).json();
    if (
      !manifest ||
      manifest.schema !== 1 ||
      typeof manifest.version !== "string" ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(manifest.version) ||
      !Number.isSafeInteger(manifest.builtAt) ||
      manifest.builtAt < 0 ||
      manifest.builtAt <= current.builtAt ||
      manifest.version === current.version ||
      !Array.isArray(manifest.assets) ||
      !manifest.assets.length ||
      manifest.assets.length > 100 ||
      typeof manifest.html !== "string" ||
      !/^[a-f0-9]{64}$/.test(manifest.html) ||
      !manifest.assets.every(
        (asset) =>
          asset &&
          typeof asset.path === "string" &&
          /^assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(asset.path) &&
          typeof asset.hash === "string" &&
          /^[a-f0-9]{64}$/.test(asset.hash)
      )
    )
      return null;
    if (!verify) return manifest;
    const html = await read("index.html");
    if ((await digest(await html.arrayBuffer())) !== manifest.html) return null;
    // Warm the exact URLs requested by the new HTML, in parallel within budget.
    const assets = await Promise.all(
      manifest.assets.map(async (asset) => {
        const response = await read(asset.path, true);
        return (await digest(await response.arrayBuffer())) === asset.hash;
      })
    );
    if (!assets.every(Boolean)) return null;
    const latest = await (await read("version.json")).json();
    return JSON.stringify(latest) === JSON.stringify(manifest) ? manifest : null;
  }
  try {
    return await Promise.race([probe(), deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
