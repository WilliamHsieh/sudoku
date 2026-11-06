import { afterEach, expect, it, vi } from "vitest";
import { fixture } from "../offline/test-fixture.js";
import { validateManifest, createReleaseStore } from "../offline/releases.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("verifies every shell byte and rereads the manifest before ready", async () => {
  const x = await fixture();
  const manifest = await x.release("new");
  await x.store.stage(manifest);
  expect(x.requests).toHaveLength(4);
  expect(
    x.requests.every(
      ({ url, options }) =>
        new URL(url).searchParams.has("_sudoku_check") &&
        options.cache === "no-store" &&
        options.redirect === "error"
    )
  ).toBe(true);
});
it("manifest-only probes read only version.json", async () => {
  const x = await fixture();
  await x.release("new");
  expect(await x.store.manifest()).toMatchObject({ version: "new" });
  expect(x.requests).toHaveLength(1);
});
it.each(["index.html", "assets/new.js"])("rejects mixed deployment bytes: %s", async (path) => {
  const x = await fixture();
  const manifest = await x.release("new");
  x.bodies.set(path, "old or error HTML");
  await expect(x.store.stage(manifest)).rejects.toThrow("verification");
  expect(await x.store.ready("new")).toBeNull();
});
it.each([
  { schema: 1 },
  { version: 12 },
  { version: "bad/version" },
  { builtAt: 1.5 },
  { bank: { path: "banks/wrong.json", hash: "a".repeat(64) } },
  { assets: [] },
  { assets: [null] },
  ...["../outside.js", "https://other.test/evil.js", "assets/new.js?extra=1"].map((path) => ({
    assets: [{ path, hash: "a".repeat(64) }],
  })),
])("rejects invalid manifest fields: %j", async (fields) => {
  const x = await fixture();
  const manifest = await x.release("new");
  expect(() => validateManifest({ ...manifest, ...fields })).toThrow();
});
it("does not fetch anything for a verified ready release", async () => {
  const x = await fixture();
  const manifest = await x.release("new");
  await x.store.stage(manifest);
  x.requests.length = 0;
  await x.store.stage(manifest);
  expect(x.requests).toHaveLength(0);
});
it("rejects missing assets, malformed JSON, redirects and offline errors", async () => {
  const x = await fixture();
  const manifest = await x.release("new");
  x.bodies.delete("assets/new.js");
  await expect(x.store.stage(manifest)).rejects.toThrow();
  x.bodies.set("version.json", "not json");
  await expect(x.store.manifest()).rejects.toThrow();
  x.bodies.set("version.json", Error("offline/redirect"));
  await expect(x.store.manifest()).rejects.toThrow();
});
it.each(["fetch", "body", "hash"])(
  "bounds a stalled %s and leaves no ready marker",
  async (stage) => {
    const x = await fixture();
    const manifest = await x.release("new");
    vi.useFakeTimers();
    const stalled = new Promise(() => {});
    /** @type {AbortSignal | undefined} */
    let signal;
    const store = createReleaseStore({
      root: "https://example.org/sudoku/",
      caches: x.caches,
      budgetMs: 100,
      fetch: async (_url, options) => {
        signal = options.signal;
        if (stage === "fetch") return stalled;
        const response = new Response("new");
        if (stage === "body")
          response.clone = () => Object.assign(new Response(), { arrayBuffer: () => stalled });
        return response;
      },
    });
    if (stage === "hash") vi.stubGlobal("crypto", { subtle: { digest: () => stalled } });
    const result = expect(store.stage(manifest)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(await store.ready("new")).toBeNull();
  }
);
