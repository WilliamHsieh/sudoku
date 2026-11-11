import { openCatalog } from "./catalog.js";

/** Read only this document's prepared release. Preparation/repair belongs to the offline flow.
 * The descriptor is injected by the build; it is independent of the NYT date bank.
 * @param {{descriptor?: {path: string, hash: string, version: string, builtAt: number}, cacheStorage?: CacheStorage, root?: string}} [options]
 */
export async function loadPublished({
  descriptor = globalThis.__sudokuBankCatalog,
  cacheStorage = globalThis.caches,
  root = new URL(import.meta.env.BASE_URL, globalThis.location.href).href,
} = {}) {
  // Capture the build identity before awaiting cache access.
  const entry = descriptor && { ...descriptor };
  if (
    !entry ||
    !/^[a-f0-9]{64}$/.test(entry.hash) ||
    entry.path !== `banks/${entry.hash}.json` ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(entry.version) ||
    !Number.isSafeInteger(entry.builtAt)
  )
    throw new Error("Published catalog is not configured");
  const name = `sudoku-offline-v1:${new URL(root).pathname}:release:${entry.version}`;
  if (!(await cacheStorage.keys()).includes(name))
    throw new Error("Catalog release is not prepared");
  const cache = await cacheStorage.open(name);
  const ready = await cache.match(new URL("__ready", root));
  const manifest = ready && (await ready.json());
  if (
    manifest?.schema !== 2 ||
    manifest.version !== entry.version ||
    manifest.builtAt !== entry.builtAt ||
    !manifest.assets?.some(
      (/** @type {{path: string, hash: string}} */ asset) =>
        asset.path === entry.path && asset.hash === entry.hash
    )
  )
    throw new Error("Catalog release is not prepared");
  const response = await cache.match(new URL(entry.path, root));
  if (!response) throw new Error("Published catalog is missing");
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== entry.hash) throw new Error("Published catalog hash mismatch");
  return (await openCatalog(JSON.parse(new TextDecoder().decode(bytes)))).catalog;
}
