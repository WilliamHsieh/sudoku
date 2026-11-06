import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";

export function versionPlugin() {
  const version =
    process.env.SUDOKU_BUILD_VERSION ||
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const builtAt = Number(process.env.SUDOKU_BUILD_TIME || Date.now());
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(version) || !Number.isSafeInteger(builtAt))
    throw new Error("Invalid build identity");
  const hash = (source) => createHash("sha256").update(source).digest("hex");
  let bank;
  return {
    name: "sudoku-build-version",
    apply: "build",
    enforce: "post",
    config: () => ({ define: { __SUDOKU_BUILD__: JSON.stringify({ version, builtAt }) } }),
    transform(code, id) {
      if (id !== resolve("src/puzzles.js")) return;
      // Read the scraper's normal module after fixture transforms. The data
      // stays in source for scraper validation but leaves the executable app.
      const data = new Function(code.replace("export const puzzleData =", "return"))();
      const source = JSON.stringify(data);
      const digest = hash(source);
      bank = { path: `banks/${digest}.json`, hash: digest };
      this.emitFile({ type: "asset", fileName: bank.path, source });
      return "export const puzzleData = globalThis.__sudokuPuzzleBank;";
    },
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "sudoku-build", content: version }, injectTo: "head" },
      {
        tag: "meta",
        attrs: { name: "sudoku-built-at", content: String(builtAt) },
        injectTo: "head",
      },
    ],
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const html = bundle["index.html"];
        if (!html || html.type !== "asset") throw new Error("Missing build HTML");
        if (!bank) throw new Error("Missing complete puzzle bank");
        const assets = Object.values(bundle)
          .filter((entry) => entry.fileName !== bank.path && !entry.fileName.endsWith(".map"))
          .map((entry) => ({
            path: entry.fileName,
            hash: hash(entry.type === "chunk" ? entry.code : entry.source),
          }));
        // Vite copies public files after generateBundle. Include every icon.
        const publicRoot = resolve("public");
        for (const file of readdirSync(publicRoot, { recursive: true, withFileTypes: true })) {
          if (!file.isFile()) continue;
          const path = relative(publicRoot, resolve(file.parentPath, file.name));
          if (!assets.some((asset) => asset.path === path))
            assets.push({ path, hash: hash(readFileSync(resolve(publicRoot, path))) });
        }
        const worker =
          readFileSync("offline/releases.js", "utf8").replaceAll("export ", "") +
          "\n" +
          readFileSync("offline/worker.js", "utf8");
        this.emitFile({ type: "asset", fileName: "sw.js", source: worker });
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          // Already-open schema-1 clients verify only HTML and JS/CSS within
          // 1500 ms. Both contracts come from these same final build bytes.
          source: JSON.stringify({
            schema: 1,
            version,
            builtAt,
            html: assets.find((asset) => asset.path === "index.html").hash,
            assets: assets.filter((asset) => /^assets\/.*\.(js|css)$/.test(asset.path)),
            release: { schema: 2, version, builtAt, bank, assets },
          }),
        });
      },
    },
  };
}
