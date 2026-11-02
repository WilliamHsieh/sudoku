import { test as base } from "@playwright/test";
import { build, preview } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEMO_PUZZLE } from "./helpers.js";

// Keep August's six-row calendar and October's latest puzzles independent of
// the daily scraper, including when the clock advances into November.
const puzzleData = {};
for (const month of [8, 9, 10]) {
  const days = new Date(2026, month, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    puzzleData[date] = { easy: DEMO_PUZZLE, medium: DEMO_PUZZLE, hard: DEMO_PUZZLE };
  }
}

export const test = base.extend({
  fixedPuzzleURL: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const root = await mkdtemp(join(tmpdir(), "sudoku-fixed-puzzles-"));
      let server;
      try {
        const outDir = join(root, "dist");
        await build({
          cacheDir: join(root, "cache"),
          logLevel: "error",
          build: { outDir, emptyOutDir: true },
          plugins: [
            {
              name: "fixed-puzzles",
              enforce: "pre",
              transform(_code, id) {
                if (id === resolve("src/puzzles.js")) {
                  return `export const puzzleData = ${JSON.stringify(puzzleData)};`;
                }
              },
            },
          ],
        });
        server = await preview({
          build: { outDir },
          preview: { host: "127.0.0.1", port: 0 },
        });
        await use(server.resolvedUrls.local[0]);
      } finally {
        await server?.close();
        await rm(root, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ fixedPuzzleURL }, use) => {
    await use(fixedPuzzleURL);
  },
});
