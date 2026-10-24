import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { probeDeployment } from "./auto-update.js";
import { updateBeforeMount } from "./auto-update-browser.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const current = { version: "old", builtAt: 1 };
function deployment() {
  const html = '<script src="/sudoku/assets/new.js"></script>';
  const js = 'console.log("new build")';
  const manifest = {
    schema: 1,
    version: "new",
    builtAt: 2,
    html: hash(html),
    assets: [{ path: "assets/new.js", hash: hash(js) }],
  };
  const bodies = new Map([
    ["/sudoku/index.html", html],
    ["/sudoku/assets/new.js", js],
  ]);
  const fetcher = vi.fn(async (url, init) => {
    const asset = url.pathname.includes("/assets/");
    expect(init.cache).toBe(asset ? "reload" : "no-store");
    expect(init.redirect).toBe("error");
    expect(url.searchParams.has("_sudoku_check")).toBe(!asset);
    const body = url.pathname.endsWith("version.json")
      ? JSON.stringify(manifest)
      : bodies.get(url.pathname);
    return new Response(body ?? "missing", { status: body ? 200 : 404 });
  });
  vi.stubGlobal("location", { href: "https://example.test/sudoku/?q=123" });
  vi.stubGlobal("fetch", fetcher);
  return { manifest, bodies, fetcher };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("verifies HTML, warms exact asset URLs and rereads the manifest within one budget", async () => {
  const { fetcher } = deployment();
  expect(await probeDeployment("/sudoku/", current, { verify: true })).toMatchObject({
    version: "new",
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("foreground checks read only version.json", async () => {
  const { fetcher } = deployment();
  expect(await probeDeployment("/sudoku/", current)).toMatchObject({ version: "new" });
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["/sudoku/index.html", "/sudoku/assets/new.js"])(
  "rejects mixed deployment bytes: %s",
  async (path) => {
    const { bodies } = deployment();
    bodies.set(path, "old or error HTML");
    expect(await probeDeployment("/sudoku/", current, { verify: true })).toBeNull();
  }
);
it("rejects a manifest changed during verification", async () => {
  const { manifest, fetcher } = deployment();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...manifest, version: "other" })));
  expect(await probeDeployment("/sudoku/", current, { verify: true })).toBeNull();
});
it.each([
  { schema: 2 },
  { version: 12 },
  { version: "bad/version" },
  { builtAt: 1.5 },
  { html: "invalid" },
  { assets: [] },
  { assets: [null] },
  ...["../outside.js", "https://other.test/evil.js", "assets/new.js?extra=1"].map((path) => ({
    assets: [{ path, hash: "a".repeat(64) }],
  })),
])("rejects invalid manifest fields: %j", async (fields) => {
  const { manifest, fetcher } = deployment();
  Object.assign(manifest, fields);
  expect(await probeDeployment("/sudoku/", current, { verify: true })).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each([0, 1])(
  "cold launch does not navigate to a different build with builtAt %i",
  async (builtAt) => {
    const { manifest, fetcher } = deployment();
    manifest.builtAt = builtAt;
    const replace = vi.fn();
    const values = new Map();
    const storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
    };
    vi.stubGlobal("location", { href: "https://example.test/sudoku/?q=123", replace });
    vi.stubGlobal("sessionStorage", storage);

    expect(await updateBeforeMount({ current, base: "/sudoku/" })).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  }
);
it("does not fetch HTML for the current version", async () => {
  const { manifest, fetcher } = deployment();
  manifest.version = "old";
  expect(await probeDeployment("/sudoku/", current, { verify: true })).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
it("falls through on missing assets, malformed JSON, redirects or offline errors", async () => {
  const { bodies, fetcher } = deployment();
  bodies.delete("/sudoku/assets/new.js");
  expect(await probeDeployment("/sudoku/", current, { verify: true })).toBeNull();
  fetcher.mockResolvedValueOnce(new Response("not json"));
  expect(await probeDeployment("/sudoku/", current)).toBeNull();
  fetcher.mockRejectedValueOnce(Error("redirect/offline"));
  expect(await probeDeployment("/sudoku/", current)).toBeNull();
});
it.each(["fetch", "body", "hash"])(
  "enforces the total budget even on a stalled %s",
  async (stage) => {
    vi.useFakeTimers();
    const { fetcher } = deployment();
    const stalled = new Promise(() => {});
    if (stage === "fetch") fetcher.mockReturnValueOnce(stalled);
    if (stage === "body")
      fetcher.mockResolvedValueOnce(Object.assign(new Response(), { json: () => stalled }));
    if (stage === "hash") vi.stubGlobal("crypto", { subtle: { digest: () => stalled } });
    const result = probeDeployment("/sudoku/", current, { verify: true });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBeNull();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  }
);
