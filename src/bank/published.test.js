import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importCatalog } from "./import.js";
import { validateCatalog, requireVerifiedCatalog } from "./catalog.js";
import { fixtureLines, source } from "./test-fixtures.js";
import { SOURCE_REPO, SOURCE_SHA } from "./source.js";
import { serializePublication } from "../../scripts/publish-bank.mjs";
import { loadPublished } from "./loadPublished.js";

const text = readFileSync(new URL("./published/catalog-v1.json", import.meta.url), "utf8");
const published = JSON.parse(text);

it("publishes byte-identical output from two imports of a synthetic fixture", async () => {
  const run = async () =>
    serializePublication(
      await importCatalog(
        fixtureLines.map((line) => ({ line, sourceBucket: "synthetic.txt" })),
        { source, catalogVersion: "synthetic-v1", maxPerLevel: 3 }
      ),
      3
    );
  expect(Buffer.from(await run()).equals(Buffer.from(await run()))).toBe(true);
});

it("validates every committed puzzle, index, provenance and published count", async () => {
  const catalog = await validateCatalog(published);
  expect(catalog.source).toMatchObject({ repo: SOURCE_REPO, gitSha: SOURCE_SHA });
  expect(catalog.catalogVersion).toBe("sampled-v1");
  expect(catalog.puzzles.length).toBeGreaterThan(0);
  expect(catalog.puzzles.length).toBeLessThanOrEqual(4000);
  for (let level = 1; level <= 8; level++) {
    const count = catalog.puzzles.filter((p) => p.level === level).length;
    expect(count).toBe(published.publication.published.perLevel[level]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(500);
  }
  for (const [rating, ids] of Object.entries(catalog.ratingIndex))
    expect(ids.length).toBe(published.publication.published.perRating[rating]);
  await expect(validateCatalog({ ...published, schema: 999 })).rejects.toThrow();
});

function loaderOptions(body = text, expectedBody = text, ready = true) {
  const hash = createHash("sha256").update(expectedBody).digest("hex");
  const descriptor = { hash, path: `banks/${hash}.json`, version: "test", builtAt: 1000 };
  const root = "https://example.org/sudoku/";
  const manifest = { schema: 2, version: "test", builtAt: 1000, assets: [descriptor] };
  const cacheStorage = /** @type {CacheStorage} */ (
    /** @type {unknown} */ ({
      keys: async () => ["sudoku-offline-v1:/sudoku/:release:test"],
      open: async () => ({
        match: async (url) =>
          String(url).endsWith("__ready")
            ? ready
              ? new Response(JSON.stringify(manifest))
              : undefined
            : body === null
              ? undefined
              : new Response(body),
      }),
    })
  );
  return { descriptor, cacheStorage, root };
}

it("reads and opens the prepared catalog as an immutable verified snapshot", async () => {
  const catalog = await loadPublished(loaderOptions());
  expect(catalog).toEqual(published);
  expect(() => requireVerifiedCatalog(catalog)).not.toThrow();
  expect(Object.isFrozen(catalog.puzzles[0])).toBe(true);
});

it("fails closed on missing preparation, missing bytes, or tampered bytes", async () => {
  await expect(loadPublished(loaderOptions(text, text, false))).rejects.toThrow("not prepared");
  await expect(loadPublished(loaderOptions(null))).rejects.toThrow("missing");
  await expect(loadPublished(loaderOptions(text + " "))).rejects.toThrow("hash mismatch");
  const options = loaderOptions();
  options.descriptor.path = "banks/wrong.json";
  await expect(loadPublished(options)).rejects.toThrow("not configured");
});

it("rejects invalid catalog semantics even when the asset digest matches", async () => {
  const bad = structuredClone(published);
  bad.puzzles[0].level = 8;
  const bytes = JSON.stringify(bad);
  await expect(loadPublished(loaderOptions(bytes, bytes))).rejects.toThrow("Invalid puzzle");
});
