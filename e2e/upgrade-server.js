import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { buildRoot } from "./upgrade-builds.js";

// Real files from two separate Vite builds, switched without touching browser
// storage or replacing the running page. Each test owns its own deployment.
export async function upgradeServer() {
  let version = "old";
  let fault = "";
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    const relative = url.pathname.replace(/^\/sudoku\//, "") || "index.html";
    if (!url.pathname.startsWith("/sudoku/") || relative.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    if (fault === "offline" || (fault === "version-error" && relative === "version.json")) {
      res.writeHead(503).end("Temporarily unavailable");
      return;
    }
    if (
      fault === "missing-asset" &&
      relative.endsWith(".js") &&
      url.searchParams.has("_sudoku_check")
    ) {
      res.writeHead(404).end("Missing asset");
      return;
    }
    const selected =
      (fault === "old-html" && relative === "index.html") ||
      (fault === "stale-navigation" && !url.searchParams.has("_sudoku_check"))
        ? "old"
        : version;
    try {
      const body = await readFile(join(buildRoot, selected, relative));
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      };
      res
        .writeHead(200, {
          "Content-Type": types[extname(relative)] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/sudoku/`,
    requests,
    publish: () => {
      version = "new";
    },
    fault: (value) => {
      fault = value;
    },
    close: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  };
}
