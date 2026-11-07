#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, resolve } from "node:path";
import { pinnedSource, SOURCE_SHA, SOURCE_REPO } from "../src/bank/source.js";
import { importCatalog } from "../src/bank/import.js";

const args = process.argv.slice(2);
const files = [];
const options = {};
const flags = new Set([
  "--out",
  "--catalog-version",
  "--source-repo",
  "--source-sha",
  "--max-per-level",
]);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg.startsWith("--")) files.push(arg);
  else if (flags.has(arg) && args[i + 1] && !args[i + 1].startsWith("--")) options[arg] = args[++i];
  else throw new Error(`Unknown or incomplete option: ${arg}`);
}
if (!files.length || !options["--out"] || !options["--catalog-version"]) {
  throw new Error(
    "Usage: node scripts/import-bank.mjs --out PATH --catalog-version VERSION [--max-per-level 500] [--source-repo URL] [--source-sha SHA] FILE..."
  );
}
if (files.some((file) => resolve(file) === resolve(options["--out"])))
  throw new Error("Output must not replace an input");
if (options["--source-sha"] && options["--source-sha"] !== SOURCE_SHA)
  throw new Error("Trusted verification requires the pinned source commit");
if (options["--source-repo"] && options["--source-repo"] !== SOURCE_REPO)
  throw new Error("Trusted verification requires the pinned source repository");
async function* lines() {
  for (const file of files) {
    const input = createReadStream(file, { encoding: "utf8" });
    const reader = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of reader) yield { line, sourceBucket: basename(file) };
    } finally {
      reader.close();
      input.destroy();
    }
  }
}
const result = await importCatalog(lines(), {
  catalogVersion: options["--catalog-version"],
  source: pinnedSource(files.map((file) => basename(file))),
  ...(options["--max-per-level"] ? { maxPerLevel: Number(options["--max-per-level"]) } : {}),
});
if (!result.catalog.puzzles.length) throw new Error("No valid puzzles; output left intact");
const temporary = `${options["--out"]}.tmp-${process.pid}`;
await writeFile(temporary, JSON.stringify(result.catalog) + "\n", { flag: "wx" });
await rename(temporary, options["--out"]);
console.log(JSON.stringify(result.report, null, 2));
