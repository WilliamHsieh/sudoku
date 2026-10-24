import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export function versionPlugin() {
  const version =
    process.env.SUDOKU_BUILD_VERSION ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const builtAt = Number(process.env.SUDOKU_BUILD_TIME || Date.now());
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(version) || !Number.isSafeInteger(builtAt))
    throw new Error("Invalid build identity");
  const hash = (source) => createHash("sha256").update(source).digest("hex");
  return {
    name: "sudoku-build-version",
    apply: "build",
    enforce: "post",
    config: () => ({ define: { __SUDOKU_BUILD__: JSON.stringify({ version, builtAt }) } }),
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "sudoku-build", content: version }, injectTo: "head" },
    ],
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const html = bundle["index.html"];
        if (!html || html.type !== "asset") throw new Error("Missing build HTML");
        const assets = Object.values(bundle)
          .filter((entry) => /\.(js|css)$/.test(entry.fileName))
          .map((entry) => ({
            path: entry.fileName,
            hash: hash(entry.type === "chunk" ? entry.code : entry.source),
          }));
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: JSON.stringify({ schema: 1, version, builtAt, html: hash(html.source), assets }),
        });
      },
    },
  };
}
