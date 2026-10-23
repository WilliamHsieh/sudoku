import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { probeDeployment } from "./auto-update.js";

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
    expect(init.cache).toBe("no-store");
    expect(url.searchParams.has("_sudoku_check")).toBe(true);
    const body = url.pathname.endsWith("version.json")
      ? JSON.stringify(manifest)
      : bodies.get(url.pathname);
    return new Response(body ?? "missing", { status: body ? 200 : 404 });
  });
  vi.stubGlobal("location", { href: "https://example.test/sudoku/?q=123" });
  vi.stubGlobal("fetch", fetcher);
  return { manifest, bodies, fetcher };
}
afterEach(() => vi.unstubAllGlobals());
it("verifies HTML and asset bytes under the Pages base path and rereads the manifest", async () => {
  const { fetcher } = deployment();
  expect(await probeDeployment("/sudoku/", current)).toMatchObject({ version: "new" });
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it.each(["/sudoku/index.html", "/sudoku/assets/new.js"])(
  "rejects stale or rewritten content: %s",
  async (path) => {
    const { bodies } = deployment();
    bodies.set(path, "old or error HTML");
    expect(await probeDeployment("/sudoku/", current)).toBeNull();
  }
);
it("rejects a manifest that changes during validation", async () => {
  const { fetcher } = deployment();
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        schema: 1,
        version: "other",
        builtAt: 3,
        html: hash('<script src="/sudoku/assets/new.js"></script>'),
        assets: [{ path: "assets/new.js", hash: hash('console.log("new build")') }],
      })
    )
  );
  expect(await probeDeployment("/sudoku/", current)).toBeNull();
});
it.each(["../outside.js", "https://other.test/evil.js", "assets/new.js?extra=1"])(
  "rejects unsafe asset paths: %s",
  async (path) => {
    const { manifest } = deployment();
    manifest.assets[0].path = path;
    expect(await probeDeployment("/sudoku/", current)).toBeNull();
  }
);
it("does not fetch the app again for the current version", async () => {
  const { manifest, fetcher } = deployment();
  manifest.version = "old";
  expect(await probeDeployment("/sudoku/", current)).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
});
it("rejects missing assets and malformed JSON without recommending navigation", async () => {
  const { bodies, fetcher } = deployment();
  bodies.delete("/sudoku/assets/new.js");
  await expect(probeDeployment("/sudoku/", current)).rejects.toThrow();
  fetcher.mockResolvedValueOnce(new Response("not json"));
  await expect(probeDeployment("/sudoku/", current)).rejects.toThrow();
});
