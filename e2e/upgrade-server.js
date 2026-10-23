import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { buildRoot } from "./upgrade-builds.js";

// Each test owns a deployment of two real production builds.
export async function upgradeServer() {
  let version = "old";
  let fault = "";
  let oldLaunches = 0;
  let newLaunches = 0;
  let brokenNavigation = false;
  const requests = [];
  const abortedChecks = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    const relative = url.pathname.replace(/^\/sudoku\//, "") || "index.html";
    if (!url.pathname.startsWith("/sudoku/") || relative.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    if (relative === "version.json") {
      if (fault === "offline") {
        req.socket.destroy();
        return;
      }
      if (fault === "version-error") {
        res.writeHead(503).end("Unavailable");
        return;
      }
      if (fault === "timeout") {
        const started = Date.now();
        res.on("close", () => {
          if (!res.writableEnded) abortedChecks.push(Date.now() - started);
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    const navigation = relative === "index.html" && !url.searchParams.has("_sudoku_check");
    if (navigation && url.searchParams.has("_sudoku_update") && fault === "missing-asset")
      brokenNavigation = true;
    if (brokenNavigation && fault === "missing-asset" && relative.endsWith(".js")) {
      res.writeHead(404).end("Missing asset");
      return;
    }
    const selected =
      navigation && newLaunches-- > 0
        ? "new"
        : (fault === "old-html" && relative === "index.html") ||
            (navigation && (fault === "stale-navigation" || oldLaunches-- > 0))
          ? "old"
          : version;
    try {
      let body;
      try {
        body = await readFile(join(buildRoot, selected, relative));
      } catch (error) {
        // Retain both builds' hashed assets for already-open or cached shells.
        if (!relative.startsWith("assets/")) throw error;
        body = await readFile(join(buildRoot, selected === "old" ? "new" : "old", relative));
      }
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
          "Cache-Control": relative.startsWith("assets/") ? "public, max-age=3600" : "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/sudoku/`,
    requests,
    abortedChecks,
    publish: () => {
      version = "new";
    },
    launchOld: () => {
      oldLaunches = 1;
    },
    launchNew: () => {
      newLaunches = 1;
    },
    fault: (value) => {
      fault = value;
      brokenNavigation = false;
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
