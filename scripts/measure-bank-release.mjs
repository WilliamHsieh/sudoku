#!/usr/bin/env node
// Usage: node scripts/measure-bank-release.mjs /absolute/baseline /absolute/after [more builds]
// Cold Chromium profiles; one shared server bandwidth limit also covers service worker requests.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const directories = process.argv.slice(2).map((path) => resolve(path));
if (!directories.length) throw new Error("Supply at least one built release directory");
const browser = await chromium.launch();
try {
  for (const directory of directories) {
    const manifestBytes = await readFile(join(directory, "version.json"));
    const manifest = JSON.parse(manifestBytes).release;
    const paths = [...manifest.assets, manifest.bank].map(({ path }) => path);
    const files = new Map(
      await Promise.all(
        [...paths, "version.json", "sw.js"].map(async (path) => {
          const raw = await readFile(join(directory, path));
          return [path, { raw, gzip: gzipSync(raw) }];
        })
      )
    );
    const sizes = (names) =>
      Object.fromEntries(
        ["raw", "gzip"].map((encoding) => [
          encoding,
          names.reduce((sum, name) => sum + files.get(name)[encoding].length, 0),
        ])
      );
    console.log(
      JSON.stringify({
        directory,
        release: sizes(paths),
        includingManifestAndWorker: sizes([...paths, "version.json", "sw.js"]),
        catalogs: paths
          .filter((p) => p.startsWith("banks/"))
          .map((path) => ({ path, ...sizes([path]) })),
      })
    );
    for (const mbps of [1.5, 10])
      for (const encoding of ["raw", "gzip"]) {
        // 40 ms response latency plus a shared 20 ms token bucket, with no accumulated burst.
        const queue = [];
        let transferred = 0;
        const tick = setInterval(() => {
          let budget = Math.floor(((mbps * 1_000_000) / 8) * 0.02);
          while (budget && queue.length) {
            const item = queue.shift();
            if (item.res.destroyed) continue;
            const length = Math.min(budget, item.body.length - item.offset, 16_384);
            item.res.write(item.body.subarray(item.offset, item.offset + length));
            item.offset += length;
            budget -= length;
            transferred += length;
            if (item.offset === item.body.length) item.res.end();
            else queue.push(item);
          }
        }, 20);
        const server = createServer((req, res) => {
          const url = new URL(req.url, "http://localhost");
          const path = url.pathname.replace(/^\/sudoku\//, "") || "index.html";
          const data = files.get(path);
          if (!data) {
            res.writeHead(404).end();
            return;
          }
          const types = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".woff2": "font/woff2",
          };
          setTimeout(() => {
            if (res.destroyed) return;
            const body = data[encoding];
            res.writeHead(200, {
              "Content-Type": types[extname(path)] || "application/octet-stream",
              "Content-Length": body.length,
              "Cache-Control": "no-store",
              ...(encoding === "gzip" ? { "Content-Encoding": "gzip" } : {}),
            });
            queue.push({ res, body, offset: 0 });
          }, 40);
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
        const context = await browser.newContext();
        try {
          await context.addInitScript(() => {
            const channels = new WeakMap();
            const OriginalChannel = window.MessageChannel;
            window.MessageChannel = class extends OriginalChannel {
              constructor() {
                super();
                channels.set(this.port2, this.port1);
              }
            };
            const post = ServiceWorker.prototype.postMessage;
            ServiceWorker.prototype.postMessage = function (message, transfer) {
              if (message.type === "PREPARE") {
                window.__prepareStart = performance.now();
                channels.get(transfer[0]).addEventListener("message", ({ data }) => {
                  if (data.state === "preparing") return;
                  window.__prepareResult = {
                    ms: performance.now() - window.__prepareStart,
                    error: data.error ?? null,
                  };
                });
              }
              return post.call(this, message, transfer);
            };
          });
          const page = await context.newPage();
          const started = performance.now();
          await page.goto(`http://127.0.0.1:${server.address().port}/sudoku/`);
          await page.waitForFunction(() => window.__prepareResult, null, { timeout: 140_000 });
          const prepare = await page.evaluate(() => window.__prepareResult);
          console.log(
            JSON.stringify({
              directory,
              mbps,
              encoding,
              prepare,
              navigationMs: performance.now() - started,
              transferred,
            })
          );
          if (prepare.error) throw new Error(`Cold prepare failed: ${prepare.error}`);
        } finally {
          await context.close();
          clearInterval(tick);
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      }
  }
} finally {
  await browser.close();
}
