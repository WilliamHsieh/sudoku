import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const buildRoot = resolve("node_modules/.cache/sudoku-upgrade");
export default function buildUpgrades() {
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
}
