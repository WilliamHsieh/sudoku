export const SOURCE_SHA = "d8c8ebaee0c08c412cfba96af1923dfa61c83317";
export const SOURCE_REPO = "https://github.com/WilliamHsieh/sudoku-exchange-puzzle-bank";
/** Provenance of the trusted build input, not a claim that arbitrary input was solved.
 * Caller must supply files from this commit. Synthetic fixtures are only rule tests.
 * @param {string[]} files */
export function pinnedSource(files) {
  return {
    repo: SOURCE_REPO,
    gitSha: SOURCE_SHA,
    files,
    license: "Public domain",
    licenseUrl: `${SOURCE_REPO}/blob/${SOURCE_SHA}/LICENSE.txt`,
    grader: { name: "Sukaku Explainer", version: "unknown", settings: "unknown" },
    verification: {
      method: "trusted_source",
      tool: "QQWing",
      version: SOURCE_SHA,
      url: `${SOURCE_REPO}/blob/${SOURCE_SHA}/README.md`,
      claim:
        "Upstream states that each generated puzzle has a unique solution; QQWing version is not recorded.",
    },
  };
}
