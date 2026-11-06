import { execFileSync } from "node:child_process";
import { build } from "vite";
import { puzzleData } from "../src/puzzles.js";
import { resolve } from "node:path";

export const buildRoot = resolve("node_modules/.cache/sudoku-upgrade");
export default async function buildUpgrades() {
  for (const [version, time] of [
    ["old", "1000"],
    ["new", "2000"],
  ]) {
    execFileSync(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "build", "--outDir", `${buildRoot}/${version}`],
      {
        env: { ...process.env, SUDOKU_BUILD_VERSION: version, SUDOKU_BUILD_TIME: time },
        stdio: "pipe",
      }
    );
  }
  const previous = {
    version: process.env.SUDOKU_BUILD_VERSION,
    time: process.env.SUDOKU_BUILD_TIME,
  };
  process.env.SUDOKU_BUILD_VERSION = "next";
  process.env.SUDOKU_BUILD_TIME = "3000";
  try {
    await build({
      logLevel: "error",
      build: { outDir: `${buildRoot}/next` },
      plugins: [
        {
          name: "new-bank-fixture",
          enforce: "pre",
          transform(_code, id) {
            if (id === resolve("src/puzzles.js"))
              return `export const puzzleData = ${JSON.stringify({ ...puzzleData, "2099-01-01": puzzleData[Object.keys(puzzleData)[0]] })};`;
          },
        },
      ],
    });
  } finally {
    if (previous.version === undefined) delete process.env.SUDOKU_BUILD_VERSION;
    else process.env.SUDOKU_BUILD_VERSION = previous.version;
    if (previous.time === undefined) delete process.env.SUDOKU_BUILD_TIME;
    else process.env.SUDOKU_BUILD_TIME = previous.time;
  }
}
