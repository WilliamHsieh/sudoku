import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

export const BASELINE_SHA = "399edbab4ff2f33773de8f6374a992620ec189f6";

/** Load the merged implementation from Git into a disposable directory in this worktree.
 * Only used by the manual benchmark; CI equivalence tests use pinned output hashes. */
export async function loadBaseline() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = await mkdtemp(join(root, ".bank-baseline-"));
  try {
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    await mkdir(join(directory, "bank"));
    const names = [
      "ability",
      "calibration",
      "catalog",
      "grade",
      "parse",
      "random",
      "records",
      "recommendations",
      "select",
    ];
    for (const name of names) {
      const source = execFileSync("git", ["show", `${BASELINE_SHA}:src/bank/${name}.js`], {
        cwd: root,
      });
      await writeFile(join(directory, "bank", `${name}.js`), source);
    }
    const modules = {};
    for (const name of ["ability", "catalog", "records", "select"])
      modules[name] = await import(pathToFileURL(join(directory, "bank", `${name}.js`)).href);
    return { ...modules, cleanup: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
