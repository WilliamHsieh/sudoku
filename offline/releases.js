// Cache protocol 1 is independent of app and bank versions. Ready releases are
// immutable except for verified repair of damaged bytes. Only explicit user
// activation changes the active pointer.
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function validateManifest(manifest) {
  if (manifest?.schema === 1 && manifest.release) {
    if (
      manifest.version !== manifest.release.version ||
      manifest.builtAt !== manifest.release.builtAt
    )
      throw new Error("Release identity changed");
    manifest = manifest.release;
  }
  const asset = (a) =>
    a &&
    typeof a.path === "string" &&
    /^(?:index\.html|apple-touch-icon\.png|(?:assets|favicon|banks)\/[a-zA-Z0-9_.-]+)$/.test(
      a.path
    ) &&
    /^[a-f0-9]{64}$/.test(a.hash);
  if (
    !manifest ||
    manifest.schema !== 2 ||
    typeof manifest.version !== "string" ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(manifest.version) ||
    !Number.isSafeInteger(manifest.builtAt) ||
    manifest.builtAt < 0 ||
    !asset(manifest.bank) ||
    manifest.bank.path !== `banks/${manifest.bank.hash}.json` ||
    !Array.isArray(manifest.assets) ||
    !manifest.assets.length ||
    manifest.assets.length > 250 ||
    !manifest.assets.every(asset) ||
    !manifest.assets.some((a) => a.path === "index.html") ||
    new Set(manifest.assets.map((a) => a.path)).size !== manifest.assets.length
  )
    throw new Error("Invalid release manifest");
  return manifest;
}

export function createReleaseStore({ root, caches, fetch, budgetMs = 60_000 }) {
  const prefix = `sudoku-offline-v1:${new URL(root).pathname}:`;
  const url = (path) => new URL(path, root).href;
  const releaseName = (version) => `${prefix}release:${version}`;
  const metadata = () => caches.open(`${prefix}metadata`);
  const json = (value) =>
    new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  async function ready(version) {
    if (!version || !/^[a-zA-Z0-9._-]{1,100}$/.test(version)) return null;
    const response = await (await caches.open(releaseName(version))).match(url("__ready"));
    return response ? validateManifest(await response.json()) : null;
  }
  async function active() {
    const response = await (await metadata()).match(url("__active"));
    return response ? ready(await response.json()) : null;
  }
  async function asset(version, path) {
    return (await caches.open(releaseName(version))).match(url(path));
  }
  async function verified(response, hash) {
    return !!response && (await sha256(await response.clone().arrayBuffer())) === hash;
  }
  async function complete(manifest) {
    for (const entry of [...manifest.assets, manifest.bank]) {
      if (!(await verified(await asset(manifest.version, entry.path), entry.hash))) return false;
    }
    return true;
  }
  async function network(path, signal) {
    const target = new URL(path, root);
    target.searchParams.set("_sudoku_check", `${Date.now()}-${Math.random()}`);
    const response = await fetch(target.href, { cache: "no-store", redirect: "error", signal });
    if (!response.ok || response.type === "opaque") throw new Error("Download unavailable");
    return response;
  }
  async function bounded(work) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        work(controller.signal),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Download timed out"));
          }, budgetMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async function manifest() {
    return bounded(async (signal) =>
      validateManifest(await (await network("version.json", signal)).json())
    );
  }
  async function stage(input, onPreparing = () => {}) {
    const next = validateManifest(input);
    const existing = await ready(next.version);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(next))
        throw new Error("Release identity changed");
      if (await complete(existing)) return existing;
      onPreparing();
      return repair(existing);
    }
    onPreparing();
    const name = releaseName(next.version);
    const cache = await caches.open(name);
    try {
      await bounded(async (signal) => {
        for (const entry of [...next.assets, next.bank]) {
          if (signal.aborted) throw new Error("Download cancelled");
          let response;
          // Content-addressed banks can be reused across app-only releases.
          if (entry === next.bank) {
            for (const key of await caches.keys()) {
              if (!key.startsWith(`${prefix}release:`) || key === name) continue;
              const candidate = await (await caches.open(key)).match(url(entry.path));
              if (await verified(candidate, entry.hash)) {
                response = candidate;
                break;
              }
            }
          }
          response ??= await network(entry.path, signal);
          if (!(await verified(response, entry.hash)))
            throw new Error("Download verification failed");
          if (entry.path === "index.html") {
            const html = await response.clone().text();
            if (
              !html.includes(`<meta name="sudoku-build" content="${next.version}">`) ||
              !html.includes(`<meta name="sudoku-built-at" content="${next.builtAt}">`)
            )
              throw new Error("Shell version does not match the release");
          }
          if (signal.aborted) throw new Error("Download cancelled");
          await cache.put(url(entry.path), response);
        }
        const latest = validateManifest(await (await network("version.json", signal)).json());
        if (JSON.stringify(latest) !== JSON.stringify(next))
          throw new Error("Deployment changed during download");
        if (signal.aborted) throw new Error("Download cancelled");
        await cache.put(url("__ready"), json(next));
      });
      return next;
    } catch (error) {
      // Only this incomplete staging cache belongs to this transaction. Ready
      // releases remain available to old tabs and browser-restored documents.
      await caches.delete(name);
      throw error;
    }
  }
  async function repair(saved) {
    // Collect every replacement first. A failed download must not delete or
    // overwrite any valid part of the active release. The saved manifest is
    // the authority even when the server now advertises a newer deployment.
    const name = `${prefix}repair:${saved.version}`;
    const staging = await caches.open(name);
    const damaged = [];
    try {
      await bounded(async (signal) => {
        for (const entry of [...saved.assets, saved.bank]) {
          if (await verified(await asset(saved.version, entry.path), entry.hash)) continue;
          const response = await network(entry.path, signal);
          if (!(await verified(response, entry.hash)))
            throw new Error("Download verification failed");
          if (signal.aborted) throw new Error("Download cancelled");
          await staging.put(url(entry.path), response);
          damaged.push(entry);
        }
        if (signal.aborted) throw new Error("Download cancelled");
      });
      const target = await caches.open(releaseName(saved.version));
      for (const entry of damaged) {
        const response = await staging.match(url(entry.path));
        if (!(await verified(response, entry.hash))) throw new Error("Repair verification failed");
        await target.put(url(entry.path), response);
      }
      if (!(await complete(saved))) throw new Error("Saved release is incomplete");
      return saved;
    } finally {
      await caches.delete(name);
    }
  }
  async function activate(version) {
    const next = await ready(version);
    if (!next || !(await complete(next))) throw new Error("Release is not ready");
    const old = await active();
    if (old && next.builtAt < old.builtAt) throw new Error("Cannot activate an older release");
    await (await metadata()).put(url("__active"), json(version));
    return next;
  }
  async function pin(client, version) {
    if (client) await (await metadata()).put(url(`__client/${client}`), json(version));
  }
  async function pinned(client) {
    const value = client && (await (await metadata()).match(url(`__client/${client}`)));
    return value ? ready(await value.json()) : active();
  }
  return { stage, ready, active, activate, asset, manifest, complete, pin, pinned };
}
