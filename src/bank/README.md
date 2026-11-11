# Issue #94: V1 logic

This implements items 1–3 of [William's V1 design](https://github.com/WilliamHsieh/sudoku/issues/94#issuecomment-6704192826): catalog construction, records, and a pure selection engine. The sampled catalog is also published through the existing offline release flow. No UI calls its loader yet. The NYT catalog, Journal, existing saves, and offline stack are unchanged.

## Build a catalog

Supply local files from `WilliamHsieh/sudoku-exchange-puzzle-bank` at commit `d8c8ebaee0c08c412cfba96af1923dfa61c83317`. Keep those source files outside this repository.

```sh
node scripts/import-bank.mjs \
  --catalog-version exchange-v1 \
  --source-sha d8c8ebaee0c08c412cfba96af1923dfa61c83317 \
  --max-per-level 500 \
  --out /tmp/agent-worktree/_notes_issue94-logic-v1/catalog.json \
  /path/to/pinned-bank/easy.txt \
  /path/to/pinned-bank/medium.txt \
  /path/to/pinned-bank/hard.txt \
  /path/to/pinned-bank/diabolical.txt
```

The source SHA defaults to that pin. The CLI rejects a different SHA or repository because its trusted verification metadata applies only to this source. It reads disk files; it does not download them. The caller is responsible for supplying the pinned files. The full upstream inputs are not committed. The sampled publication is committed separately; use the verified publication command below to regenerate it.

The importer checks the board format, legal givens, source SHA-1 prefix, and integer-tenths rating. `0.0`, nonnumeric values, and Sukaku Explainer's `20.0` “Beyond solver” marker are rejected before grading. Other valid finite integer tenths at or above 85 map to L8. The [grader implementation](https://github.com/SudokuMonster/SukakuExplainer/blob/master/diuf/sudoku/solver/Solver.java) documents that failure marker.

There is no suitable unique-solution checker in this repository. The published source metadata instead records the pinned [upstream README's QQWing unique-solution claim](https://github.com/WilliamHsieh/sudoku-exchange-puzzle-bank/blob/d8c8ebaee0c08c412cfba96af1923dfa61c83317/README.md), public-domain license, and Sukaku Explainer rating provenance. QQWing's binary version and the grader's version/settings are unknown. This trust statement is not a new proof for arbitrary caller-supplied boards. The committed fixture uses synthetic boards and ratings to test rules, not grading accuracy or player experience.

Puzzle identity is the full 40-character SHA-1 of the 81 digits. The 12-character source hash is checked and stored as provenance. Identical boards with equal ratings collapse into one entry. Any conflicting rating excludes that board from publication, including conflicts found after earlier rows filled a sample. The report keeps both ratings and the board ID under `rating_conflict`.

Sampling is stratified by product level and actual in-level rating. The quota is distributed in rounds across rating buckets, then unused capacity is redistributed. If the cap is smaller than the number of ratings, evenly spaced buckets cover the interval. Within a bucket, full-digest order supplies a deterministic pseudo-random sample independent of file order. Reports include valid unique input and published counts by actual rating and all eight levels. Input boards remain in build-time memory until conflict detection is complete; publication is capped. A cap of 500 is provisional, not an approved final publication size.

Source filenames are provenance only. `easy.txt` / `medium.txt` / `hard.txt` / `diabolical.txt` are neither product levels nor personalized modes. Practice hints are metadata; scores do not prove a particular technique is required. Unknown catalog, source, and puzzle fields survive validation.

## Use the logic

```js
const { catalog } = await openCatalog(parsedBank);
const result = selectPuzzle({
  catalog,
  playerId,
  records: projectRecords(recordLog),
  recentRecommendations: recentPicks(recommendationLog, playerId),
  coldStart: setColdStart({ kind: "level", level: 1 }),
  mode: "easy",
  seed: "caller-owned-seed",
});
```

These exports live in `catalog.js`, `select.js`, `records.js`, `recommendations.js`, and `ability.js`. `validateCatalog` and `openCatalog` clone caller input before any await. All checks, hashing, indexing, freezing, and verification use that private snapshot. `openCatalog` checks full IDs and indexes and creates the launch-local verification capability required by selection. Passing a raw, mutated, or schema-incompatible catalog fails closed. The published loader calls it only after checking the prepared release and asset hash. No boolean `ready` field bypasses that boundary.

`setColdStart({ kind: "experience", mapsToLevel })` also accepts an injected level. This module has no experience labels or experience-to-level table. Manual mode requires `level`; it selects only that level's actual ratings. Starting a manual recommendation does not change ability. Its eventual attempt supplies local evidence but cannot bypass the mode-specific promotion rules.

Selection determines a safe band, excludes active/paused boards and the last ten issued picks, and searches unseen boards. It ranks rating buckets by mode evidence, then conservative/upper-edge placement, then diversity, and samples a bucket before a board. A large bucket cannot dilute another bucket. Hard may sample a small nearby unexplored range within its safe band. Easy does not explore an upper frontier.

If the band has no unseen board, automatic modes first search lower ratings. Only after those are empty does the engine return `exhausted_in_range`, with an optional in-range `fallbackPuzzle`. That is a proposal; it does not automatically start a replay. Manual mode remains within the chosen level. Active boards and recently recommended boards are excluded even from replay proposals. Resume uses the existing saved game and does not call selection.

Every result freezes mode, candidate range, chosen bucket and ID (or null when none exists), structured reason, fallback flag, rule version, history version, catalog version, seed, and cold-start/recent-pick context. A null maximum denotes an open-ended L8 manual range. The history token is a deterministic pair of seed hashes over canonical records and recent picks; it is a diagnostic version token, not an integrity hash or an archive of history. Keep the underlying append-only logs to reproduce prior inputs. Result objects do not change when later records change.

## Records and ability

`records.js` projects an append-only event log into one record per attempt. Retry identities are `(attemptId, eventId)`; equal retries collapse and conflicting retries fail. A completion resent with a new event ID still leaves one outcome. A start snapshots the board, rating, catalog/source, mode, reason, settings, and optional full recommendation. Later catalog removal or re-rating cannot alter it.

The host supplies a cumulative **foreground effective time** through `time` events, flushing it before pause/background/close. Paused time updates are rejected. Gaps between events, no input, app crashes, and resumed wall-clock time never add play time or imply failure. Settings history remains attached to each sample. V1 deliberately does not use speed to rank ability, so different assistance settings are never compared by speed.

Outcomes distinguish independent complete, hinted complete, viewed answer, explicit give-up, in progress, and paused. Omitted feedback stays absent. Neighborhood summaries keep first-attempt counts, separate outcomes, unresolved samples, feedback distribution/missing count, settings, effective time, recency, and replays. Only independent complete and explicit give-up enter the main solvability denominator. The recent five-attempt window includes unresolved attempts; it does not silently replace them with older completions. Hints and answers are auxiliary outcomes, not mastery or proof of inability.

The model rebuilds in attempt-start order. Each distinct board contributes at most one primary attempt. Replays are excluded before board deduplication, so a replay with an equal or earlier timestamp cannot remove the original evidence. A four-of-five signal can admit the next present rating from Hard into Medium only within the current nearby frontier; a consumed window cannot raise several steps.

Medium can also explore one next-present rating from its own light completions: at least four independent Medium completes with explicit `light` feedback among the last five neighborhood attempts. Those completions must have been inside Medium when admitted and remain inside the current band. The target and evidence must stay within the ±3-tenths neighborhood; two struggle reports block the signal. Both Medium paths consume the same window after each adjustment. This exploration reuses the existing 待校準 constants and does not certify the unseen rating as familiar.

Easy expansion needs repeated independent Medium completes with explicit `light` feedback, within a Medium range that was already available for those attempts. The initial provisional Medium range can supply that evidence. Easy-only wins can strengthen familiarity in place, but never expand a ceiling. One Easy explicit give-up narrows the next range while retaining the stable model. One outlier, hints, replays, or unresolved attempts cannot supply four independent successes.

Evidence uses saved rating snapshots. When the current catalog contains the same board with a different rating, that attempt is excluded from ability evidence; its saved board and rating remain intact. Removed boards may still supply historical evidence at their saved rating if that rating exists in the current catalog. Unrated legacy/custom records cannot qualify. Seen-board filtering always uses exact digits, across catalog versions. V1 does **not** dedupe rotations, reflections, or digit permutations and makes no isomorphism claim.

Records use `sudoku-bank-records-v1`; recommendations use `sudoku-bank-recommendations-v1`. `saveEvent` and `saveRecommendation` read fresh before each write, reject unreadable storage, and verify the persisted text. They never merge stale memory after a read failure. The host must serialize writers across tabs, for example with one owner or a Web Lock. These synchronous adapters do not implement a cross-tab transaction or automatic UI persistence. Persist each issued recommendation with a stable event ID; `recentPicks` omits exhausted proposals. Preserve the snapshot in the attempt when a puzzle is started.

`inspectLegacySaves` is migration V1: retain all four legacy keys, report missing/present/unreadable state, and create no inferred evidence. It never deletes or rewrites `sudoku-progress`, `sudoku-solved`, `sudoku-replay-progress`, or `sudoku-custom-progress`, and never maps NYT difficulty to L1–L8. Unsupported new storage schemas fail closed.

## 待校準

All tuning values live in `calibration.js`:

| Parameter                   | Initial rule                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `promotionWindow`           | Most recent 5 neighborhood attempts                                                                                        |
| `minimumSamples`            | 5 attempts before expansion                                                                                                |
| `independentRequired`       | At least 4 independent completes in that window                                                                            |
| `repeatedStruggle`          | 2 struggle reports block the candidate signal                                                                              |
| `neighborhoodTenths`        | ±3 tenths, using only present ratings                                                                                      |
| `stepsPerAdjustment`        | 1 next-present-rating step per adjustment, within the neighborhood                                                         |
| `familiarityLightRequired`  | 4 independent `light` completes for familiarity/Easy promotion; promotion must be from Medium                              |
| `NO_FEEDBACK_POLICY`        | Ignore absent feedback; do not infer any feeling                                                                           |
| `maxPerLevel`               | 500, configurable with `--max-per-level`; stratify by in-level rating                                                      |
| `recentRecommendationLimit` | Exclude the last 10 issued picks                                                                                           |
| `hardExplorationShare`      | 0.2 seeded branch for nearby unexplored buckets when an unstable frontier is available; bounded by the existing Hard range |
| `conservativeBucketCount`   | Use the lower 2 equally qualified buckets for Easy, upper 2 for Medium                                                     |
| `coldEasyBelow`             | Easy minimum: anchor lower bound minus 3 tenths, floored at 10                                                             |
| `coldEasyAboveL1`           | L1 Easy maximum: anchor lower bound plus 2 tenths; other levels stop at the anchor lower bound                             |
| `coldMediumAbove`           | Medium: anchor lower bound through +3 tenths, clipped to the anchor level                                                  |
| `coldHardAbove`             | Hard: Medium upper edge through anchor lower bound +6 tenths, clipped to the anchor level                                  |

The 4-of-5 rule is a candidate signal, not an Easy classifier or a future success probability. Missing feedback is not light feedback. Cold-start bands are priors, not mastery evidence. Synthetic player sequences verify these rules only; actual experience still needs play testing.

## Publish and read the sampled catalog

Run `npm run bank:publish` from the repository root. It downloads the four source files into a temporary directory outside the repo, verifies their Git blob hashes against the tree at `SOURCE_SHA`, and runs the existing importer. It writes only `src/bank/published/catalog-v1.json` into the repo. Temporary inputs are removed on completion. With existing pinned inputs, use `npm run bank:publish -- --input-dir /path/outside/repo`; the same remote tree verification still applies.

The default cap comes from `CALIBRATION.maxPerLevel` (500, 待校準 / 未簽核). `--max-per-level` and `--out` support measurements outside the repo. Output includes source provenance, catalog version, actual input/published counts by rating and level, and the calibration status. Serialization has no wall-clock fields; the same inputs and cap produce identical bytes. Unique-solution provenance remains the upstream claim described above.

The build validates the committed catalog and emits its bytes as `banks/<sha256>.json` in `release.assets`. The unchanged offline PREPARE/STAGE/ACTIVATE flow downloads, hashes, caches, repairs, and activates this asset with the complete release. A failed catalog download keeps the old release active. This additional asset is downloaded on an app update; only the existing NYT `release.bank` has cross-release reuse in the current offline implementation.

The build injects `globalThis.__sudokuBankCatalog`, a descriptor with the asset path, SHA-256, and document release identity. `await loadPublished()` from `loadPublished.js` reads that exact prepared release from Cache API, checks the bytes and catalog semantics, and returns the immutable verified catalog accepted by selection. It makes no network request and has no fallback to another release. Call it after successful offline preparation. The NYT `__sudokuPuzzleBank` global and reader keep their current contract; App and Journal do not call the new loader.

For cold download measurements, run `node scripts/measure-bank-release.mjs /path/to/baseline-build /path/to/new-build`. It uses fresh Chromium contexts and a local server with a shared bandwidth limit of 1.5 or 10 Mbps, 40 ms response latency, and raw or gzip (level 6) responses. The limit covers service-worker traffic. It reports release bytes, bytes including manifest/worker, total transferred bytes, and actual PREPARE completion time. The existing limits remain 60 s per download transaction and 125 s per command.

Manifest hashes prove that a file matches the manifest. They do not replace semantic Sudoku validation at build time. First launch must prepare the **complete published bank**, not one level at a time, before selection. Warm launch uses the verified local release without waiting for a background update. Keep existing staging, verification, activation, bound-version, and failed-update retention behavior. Do not swap catalog or puzzle snapshots during an active game.

Player records and recommendations belong to application storage, not the service-worker resource cache. Clearing resource cache must not delete them. Item 5, UI integration and end-to-end experience validation, waits for signed-off UI.
