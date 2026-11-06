import { createReleaseStore, sha256 } from "./releases.js";
function memoryCaches() {
  const stores = new Map();
  return {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        match: async (url) => data.get(String(url))?.clone(),
        put: async (url, response) => data.set(String(url), response.clone()),
        delete: async (url) => data.delete(String(url)),
      };
    },
  };
}
export async function fixture(options = {}) {
  const bodies = new Map();
  const requests = [];
  async function release(version, bank = '"complete bank"') {
    const bankHash = await sha256(new TextEncoder().encode(bank));
    const manifest = {
      schema: 2,
      version,
      builtAt: version === "old" ? 1 : 2,
      bank: { path: `banks/${bankHash}.json`, hash: bankHash },
      assets: [],
    };
    for (const [path, body] of [
      ["index.html", version],
      [`assets/${version}.js`, version],
      [manifest.bank.path, bank],
    ]) {
      bodies.set(path, body);
      if (path !== manifest.bank.path)
        manifest.assets.push({ path, hash: await sha256(new TextEncoder().encode(body)) });
    }
    bodies.set("version.json", JSON.stringify(manifest));
    return manifest;
  }
  const caches = memoryCaches();
  const store = createReleaseStore({
    root: "https://example.org/sudoku/",
    caches,
    ...options,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      const path = new URL(url).pathname.replace("/sudoku/", "");
      const body = bodies.get(path);
      if (body instanceof Error) throw body;
      return new Response(body ?? "missing", { status: body === undefined ? 404 : 200 });
    },
  });
  return { store, release, bodies, requests, caches };
}
