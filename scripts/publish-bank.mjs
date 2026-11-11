#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { importCatalog } from "../src/bank/import.js";
import { CALIBRATION } from "../src/bank/calibration.js";
import { pinnedSource, SOURCE_REPO, SOURCE_SHA } from "../src/bank/source.js";

const files = ["easy.txt", "medium.txt", "hard.txt", "diabolical.txt"];
export function serializePublication({ catalog, report }, maxPerLevel) {
  return (
    JSON.stringify({
      ...catalog,
      publication: {
        maxPerLevel,
        calibrationStatus: "待校準 / 未簽核",
        input: report.input,
        published: report.published,
      },
    }) + "\n"
  );
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return response;
}

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (!["--input-dir", "--out", "--max-per-level"].includes(args[i]) || !args[i + 1])
      throw new Error(`Unknown or incomplete option: ${args[i]}`);
    options[args[i]] = args[++i];
  }
  const maxPerLevel = Number(options["--max-per-level"] ?? CALIBRATION.maxPerLevel);
  if (!Number.isSafeInteger(maxPerLevel) || maxPerLevel < 1)
    throw new Error("Invalid max-per-level");
  const out = resolve(options["--out"] ?? "src/bank/published/catalog-v1.json");
  const input = options["--input-dir"] ?? (await mkdtemp(join(tmpdir(), "sudoku-bank-")));
  try {
    // Resolve the tree at the pinned commit, then verify each Git blob, including local inputs.
    const repo = SOURCE_REPO.replace("https://github.com/", "");
    const tree = await (
      await download(`https://api.github.com/repos/${repo}/git/trees/${SOURCE_SHA}`)
    ).json();
    if (tree.sha !== SOURCE_SHA || tree.truncated) throw new Error("Invalid pinned source tree");
    for (const file of files) {
      const entry = tree.tree.find((entry) => entry.path === file && entry.type === "blob");
      if (!entry) throw new Error(`Missing pinned input: ${file}`);
      const path = join(input, file);
      if (resolve(path) === out) throw new Error("Output must not replace an input");
      const bytes = options["--input-dir"]
        ? await readFile(path)
        : Buffer.from(
            await (
              await download(`https://raw.githubusercontent.com/${repo}/${SOURCE_SHA}/${file}`)
            ).arrayBuffer()
          );
      const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      if (hash !== entry.sha || bytes.length !== entry.size)
        throw new Error(`Pinned source mismatch: ${file}`);
      if (!options["--input-dir"]) await writeFile(path, bytes);
      console.error(`Verified ${file}: ${bytes.length} bytes, Git blob ${hash}`);
    }
    async function* lines() {
      for (const file of files) {
        const stream = createReadStream(join(input, file), { encoding: "utf8" });
        const reader = createInterface({ input: stream, crlfDelay: Infinity });
        try {
          for await (const line of reader) yield { line, sourceBucket: file };
        } finally {
          reader.close();
          stream.destroy();
        }
      }
    }
    const result = await importCatalog(lines(), {
      source: pinnedSource(files),
      catalogVersion: "sampled-v1",
      maxPerLevel,
    });
    if (!result.catalog.puzzles.length) throw new Error("No valid puzzles; output left intact");
    await mkdir(dirname(out), { recursive: true });
    const temporary = `${out}.tmp-${process.pid}`;
    await writeFile(temporary, serializePublication(result, maxPerLevel), { flag: "wx" });
    await rename(temporary, out);
    console.log(JSON.stringify(result.report, null, 2));
  } finally {
    if (!options["--input-dir"]) await rm(input, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
