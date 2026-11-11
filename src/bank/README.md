# Issue #94: V1 logic

This implements items 1–3 of [William's V1 design](https://github.com/WilliamHsieh/sudoku/issues/94#issuecomment-6704192826): catalog construction, records, and a pure selection engine. The sampled catalog is also published through the existing offline release flow. The game now has an explicit opt-in records adapter. It adds no UI or default bank launch, and no UI calls the catalog loader yet. The NYT catalog, Journal, existing saves, and offline stack are unchanged.

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

## Opt-in unlock and sequential selection

`deriveUnlockState(attempts, policy)` in `unlock.js` accepts only one player's projected **bank** records. It never reads storage or legacy keys. Legacy play supplies no unlock credit: everyone starts fresh at L1–L3, even if legacy saves contain completed puzzles. A later caller must pass bank records only. Mixed-player input is rejected. It returns `maxOpenLevel` and counts for each level: `independentSolves`, `hintFreeSolves`, and `required`. It uses ability's `firstAttempts` rule: exclude replays first, order by start time and attempt ID, then keep one attempt per distinct board and attempt ID. An unfinished, unsuccessful, or pre-open first attempt still reserves its board; a later success or replay cannot replace it.

William's rules, signed off on 2026-11-11 via Lizzy, start everyone with L1–L3 open. Ten distinct qualifying independent solves at the current highest open level unlock the next level: ten at L3 open L4, then ten at L4 open L5, up to L8. Qualifying solves use no star-key hint panel and reveal no answer. Each frontier requires its own evidence. Wins at lower levels cannot skip a level.

Qualifying first attempts are replayed in completion-time (`endedAt`) order, with equal timestamps ordered by attempt ID using code-unit order. A solve counts only when its level is the highest open level at that point in the replay. Earlier solves at a locked level are never credited later. Each tenth qualifying solve opens only the next level, whose counter starts at zero. For example, ten earlier L4 solves followed by ten L3 solves open L4 with zero L4 credit, not L5. Missing or invalid completion timestamps supply no unlock evidence; later feedback (`updatedAt`) cannot move a solve past an unlock.

`perLevel` counts only evidence completed while that level was the highest open level. `independentSolves` counts `independent_complete` outcomes without an answer reveal; `hintFreeSolves` additionally requires `hintCount === 0` and no `hintUsed` flag. Only the latter unlocks levels. Unknown hint counts fail closed; reproject older snapshots from their event log. Hinted, viewed-answer, given-up, paused, and replay attempts cannot unlock levels.

`unlockInitialLevels: 3`, `unlockRequiredHintFreeSolves: 10`, and `unlockMaxLevel: 8` live only in `calibration.js`. These values and the star-key-only hint rule are **signed off by William 2026-11-11**. Unrelated calibration values remain 待校準. A policy can override these fields for pure rule evaluation. `mergeMaxOpenLevel(previous, derived)` returns their maximum. A later caller must persist this high-water mark so future calibration cannot re-lock earned levels. This PR writes no unlock state and does not change personalized Easy's promotion rules.

`selectPuzzle` accepts optional `maxOpenLevel`. Omission means no clamp and retains the existing selection behavior. Manual and sequential requests above this level return `status: "level_locked"`, with no puzzle or replay proposal. Personalized ranges and any lower fallback are limited to open levels. If the clamp makes the range empty, selection returns `exhausted_in_range` with no puzzle. The applied limit is included in the result context. Locked results are failures, not issued recommendations, and must not be saved to the recommendation log.

`mode: "sequential"` requires `level` and uses the same seed-bearing input contract as other modes. Within that level it selects by ascending rating, then stable catalog ID; the seed does not affect the choice and no RNG is used. It excludes played, active, paused, and recently recommended boards using the same player scope and board identity as other modes. When exhausted, it proposes the first eligible in-level replay, or returns no proposal if all boards are active/recent. It never falls back to another level. Sequential snapshots and starts use the existing schema; issuing a sequential pick remains an explicit caller action.

## Indexing and reproducibility

A verified immutable catalog has one cached lookup index, keyed by catalog object in a `WeakMap`. `openCatalog`, selection, and ability share its by-ID, by-digits, by-level, and by-rating lookups. Maps stay private; sorted buckets are read-only. Mutable raw catalog inputs to `deriveAbility` receive fresh indexes so a caller mutation cannot leave stale evidence. Selection still requires a verified catalog.

Record projection tracks seen boards per player with sets. Selection builds played/active-board sets once per history. Ability indexes local evidence by present rating and uses bounded recent windows instead of scanning the growing history for each attempt. Ordering still needs sorting; projection and evidence accumulation are linear in input size for the fixed neighborhood/window policy, plus returned sample data. Indexing does not change the evidence or seeded selection rules.

`indexes.test.js` pins SHA-256 digests of JSON outputs from master `399edbab4ff2f33773de8f6374a992620ec189f6` for generated histories. It checks ability and selection byte-for-byte for identical inputs, and record projection except the new `hintCount` field. The suite also checks index reuse and catalog-read/attempt-scan counts without timing assertions. A newly projected history includes `hintCount`, so its diagnostic history hash can differ from an older projection that omitted that field.

Run `node scripts/bank-select-benchmark.mjs` manually for 4,000 synthetic puzzles and 4,000 attempts. It loads the pinned baseline from local Git history, asserts equivalent results, and prints before/after first-call and median timings. Catalog opening/index construction and fixture generation are excluded. The script cleans up its temporary baseline modules and is not part of CI. Timings describe this Node run, not mobile-browser performance.

## Records and ability

`records.js` projects an append-only event log into one record per attempt. Retry identities are `(attemptId, eventId)`; equal retries collapse and conflicting retries fail. A completion resent with a new event ID still leaves one outcome. Every event timestamp must be a positive safe integer (therefore finite and greater than zero). Exact same-ID retries with identical content remain idempotent, even after later feedback. Any other event must be at or after the attempt's latest accepted timestamp, which also prevents pre-start events. Timestamp validation happens before ignoring terminal `complete` retries: `start10 → give_up20 → complete0` and backdated completions are rejected. Valid new-ID terminal completion retries stay in the append-only log but do not change the projected outcome, end/update time, or effective time. Invalid stored events make the log unreadable; no repair or overwrite is performed. A start snapshots the board, rating, catalog/source, mode, reason, settings, and optional full recommendation. Later catalog removal or re-rating cannot alter it.

The host supplies a cumulative **foreground effective time** through `time` events, flushing it before pause/background/close. Paused time updates are rejected. Gaps between events, no input, app crashes, and resumed wall-clock time never add play time or imply failure. Settings history remains attached to each sample. V1 deliberately does not use speed to rank ability, so different assistance settings are never compared by speed.

Outcomes distinguish independent complete, hinted complete, viewed answer, explicit give-up, in progress, and paused. Omitted feedback stays absent. Neighborhood summaries keep first-attempt counts, separate outcomes, unresolved samples, feedback distribution/missing count, settings, effective time, recency, and replays. Only independent complete and explicit give-up enter the main solvability denominator. The recent five-attempt window includes unresolved attempts; it does not silently replace them with older completions. Hints and answers are auxiliary outcomes, not mastery or proof of inability.

`hintCount` is the number of distinct star-key hint-panel uses per attempt, deduped by `(attemptId, eventId)`, and `hintUsed === (hintCount > 0)`. A `hint` event means one use of the **star key (the 3-step hint panel)**; an omitted source or `source: "star"` counts once. **Fill and the 30-second single-cell hint dot do not count and must not be recorded as `hint` events by the later wiring PR.**

For defensive compatibility, explicitly non-star sources such as `"fill"` and `"hint_dot"` remain in the append-only log but are ignored by the projection: no hint, outcome, or time change. Sources must be nonempty strings when present; timestamp and retry validation still apply, including conflicts that change a source under the same event ID. The count is reconstructed from existing events, including replay attempts; records schema remains version 1 with no new stored field.

The model rebuilds in attempt-start order. Each distinct board contributes at most one primary attempt. Replays are excluded before board deduplication, so a replay with an equal or earlier timestamp cannot remove the original evidence. A four-of-five signal can admit the next present rating from Hard into Medium only within the current nearby frontier; a consumed window cannot raise several steps.

Medium can also explore one next-present rating from its own light completions: at least four independent Medium completes with explicit `light` feedback among the last five neighborhood attempts. Those completions must have been inside Medium when admitted and remain inside the current band. The target and evidence must stay within the ±3-tenths neighborhood; two struggle reports block the signal. Both Medium paths consume the same window after each adjustment. This exploration reuses the existing 待校準 constants and does not certify the unseen rating as familiar.

Easy expansion needs repeated independent Medium completes with explicit `light` feedback, within a Medium range that was already available for those attempts. The initial provisional Medium range can supply that evidence. Easy-only wins can strengthen familiarity in place, but never expand a ceiling. One Easy explicit give-up narrows the next range while retaining the stable model. One outlier, hints, replays, or unresolved attempts cannot supply four independent successes.

Evidence uses saved rating snapshots. When the current catalog contains the same board with a different rating, that attempt is excluded from ability evidence; its saved board and rating remain intact. Removed boards may still supply historical evidence at their saved rating if that rating exists in the current catalog. Unrated legacy/custom records cannot qualify. Seen-board filtering always uses exact digits, across catalog versions. V1 does **not** dedupe rotations, reflections, or digit permutations and makes no isomorphism claim.

Records use `sudoku-bank-records-v1`; recommendations use `sudoku-bank-recommendations-v1`. `saveEvent` and `saveRecommendation` read fresh before each write, reject unreadable storage, and verify the persisted text. They never merge stale memory after a read failure. The host must serialize writers across tabs, for example with one owner or a Web Lock. These synchronous adapters do not implement a cross-tab transaction or automatic UI persistence. Persist each issued recommendation with a stable event ID; `recentPicks` omits exhausted proposals. Preserve the snapshot in the attempt when a puzzle is started.

`inspectLegacySaves` is migration V1: retain all four legacy keys, report missing/present/unreadable state, and create no inferred evidence. It never deletes or rewrites `sudoku-progress`, `sudoku-solved`, `sudoku-replay-progress`, or `sudoku-custom-progress`, and never maps NYT difficulty to L1–L8. Unsupported new storage schemas fail closed.

## Opt-in game wiring (PR C)

There is no bank button, URL parameter, automatic bank restore, or published-catalog dependency.
The existing `game.load(...)` path stays a non-bank game. It does not read bank storage, emit
bank events, or write bank keys. Legacy/NYT/daily/custom/replay saves retain their existing
formats and behavior. Legacy records supply no evidence; there is no migration.

A later host can call the programmatic API with an already selected puzzle:

```js
import { buildBankGameMeta } from "./bank/game-meta.js";
import { game } from "./game/game.svelte.js";

const meta = buildBankGameMeta(selection, {
  attemptId: crypto.randomUUID(), // generate once for this attempt
  playerId,
  source: verifiedCatalog.source,
});
const started = await game.startBank(meta);
// After reload, opt in explicitly; no selection and no second start:
const resumed = await game.startBank();
```

`buildBankGameMeta` is pure and clones the selected puzzle, level, ID, mode, source, and full
recommendation snapshot (range, reason, seed, rule/history/catalog versions and context).
It rejects locked/exhausted proposals. It does not load a catalog, generate IDs, or write storage.
`startBank` returns false for a missing resume, invalid data, or a reused attempt ID.
It leaves the current game alone in those cases. Storage write failures after launch leave the
board usable and the queued work available for retry. `createGame(options)` accepts recorder
storage, Web Locks, clock, ID generator and `onError` dependencies for isolated tests.

```text
selectPuzzle result + caller identities/source
  -> buildBankGameMeta -> game.startBank(meta)
  -> recorder.begin -> start
board edit / Notes mode / timer tick / star panel / lifecycle / solve
  -> recorder queue -> Web Lock -> fresh read -> validate -> append/verify
  -> same lock -> compare last bank checkpoint -> save/verify
explicit game.startBank() after reload
  -> validate checkpoint against start record -> restore board/time -> resume
Update -> game.flushProgress(true) -> await queues -> activate worker -> reload
```

Events:

| Event        | Trigger                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`      | Explicit `startBank(meta)`, once per new attempt ID.                                                                                                              |
| `time`       | Existing foreground timer publishes a larger whole-second value; also flushed before pause, background, close and completion. Values are cumulative milliseconds. |
| `settings`   | Existing Notes mode changes (`auto`, `tidy`, `manual`), stored as `candidateMode`. Initial mode is in `start`.                                                    |
| `pause`      | Existing manual/automatic pause, or loading another game while a bank attempt is active.                                                                          |
| `resume`     | Existing pause ends, or explicit restore of a bank checkpoint.                                                                                                    |
| `background` | `visibilitychange` with hidden visibility.                                                                                                                        |
| `close`      | `pagehide`.                                                                                                                                                       |
| `hint`       | A closed star-key panel successfully opens, including its searching/unavailable/error states.                                                                     |
| `complete`   | The board becomes solved, once per recorder session; terminal checkpoint restores do not start another attempt.                                                   |

**One star-key use means one closed-to-open transition of the three-step hint panel.**
Closing it, advancing its steps, applying its suggestion, and re-requesting an already open
panel do not add uses. Opening is disabled in Manual mode. Opening again after closing is
another use, even if it finds no hint. Fill and the 30-second single-cell hint dot never emit
`hint`. `reveal` and `give_up` remain unused; no such features are added. The cue and tap-fill
preferences are not recorded as new settings; this adapter records the existing schema's
candidate mode only.

Each action receives an attempt-prefixed UUID before it is queued. The queued event keeps
that ID and its first write timestamp through retries, including a write that succeeded but
failed verification. Records deduplicate `(attemptId, eventId)`. The timestamp is assigned
under the lock and never precedes that attempt's latest accepted timestamp, even if a tab's
wall clock moves backward. No elapsed wall time is inferred. Paused/background time and
reload gaps add no effective time. Restarting an unfinished bank board keeps the attempt,
hint evidence and cumulative effort while resetting the displayed clock. A completed bank
attempt needs a new `startBank(meta)` with a new attempt ID, rather than `restart()`.

Storage keys:

- `sudoku-bank-records-v1`: existing schema-1 append-only log; schema unchanged.
- `sudoku-bank-game-v1`: the old schema-1 single checkpoint. Read-through migration keeps
  its original text unchanged; this recorder never writes or deletes this key.
- `sudoku-bank-saves-v1`: schema-1 slot map, keyed by attempt ID. Each checkpoint contains
  answers, notes, overrides, trusted eliminations, metadata, displayed elapsed seconds,
  cumulative effective milliseconds, `playerId`, and `updatedAt`. Explicitly abandoned
  attempt IDs are retained as small markers in the same store.
- The recommendation key is unchanged; this adapter does not publish recommendations or
  persist unlock state. The caller still owns recommendation issuance.

Every record append and checkpoint write uses `navigator.locks.request("sudoku-bank-writes-v1")`.
Both run after a fresh storage read. Each slot uses its last confirmed raw value as an
optimistic revision, following `persistence.js`'s stale-save protection. A stale tab cannot
replace another tab's board. Its failed write remains queued and blocks a strict Update flush.
Without Web Locks, an in-document promise queue provides **single-tab behavior only**;
there is no cross-tab guarantee in that fallback. No localStorage spin lock is claimed.

Unknown schemas, corrupt snapshots, missing/mismatched attempt identity, unreadable storage,
and unverified writes fail closed. They do not repair or silently replace stored text.
Normal game actions never receive storage exceptions: errors go to `onError` or `console.warn`.
A strict flush rejects if work remains, so the existing Update error path prevents activation
and reload. Successful queues can be retried without duplicate events. `pagehide` requests a
final write but browsers can terminate before asynchronous locks finish; regular timer and
board checkpoints limit this loss. Explicit Update waits for the queue for at most two seconds, then continues activation/reload;
unpersisted events at that deadline are an accepted loss. The records and saves keys are not a
crash-atomic transaction; resume checks their identities and uses the log's cumulative time.

Tests use small generated fixtures, never the published catalog. They drive the game API,
hint session, cue clock, queue failures and two simulated lock-sharing contexts. The existing
browser suites check default play/persistence/pause/hints/update. No new browser entry point
or visible UI is added: **no visible UI change — skips designer review**.

## Multi-slot saves

`recorder.js` adds `BANK_SAVES_KEY`, `listSlots(playerId)`, `resume(attemptId)`,
`unfinishedSlots(playerId)`, and `abandon(attemptId, playerId)`. These are explicit opt-in
calls; constructing a recorder does not access storage. `open(meta)` prepares a new attempt
without dropping other slots; call `begin()` and `save(snapshot, elapsed)` as before.
`resume(id)` returns that checkpoint or `null`; call `begin(true)` when play resumes.
`open(null)` keeps latest-checkpoint restore, with attempt ID order breaking timestamp ties.

The layout is `{ schema: 1, slots: { [attemptId]: checkpointJSON }, abandoned: [attemptId] }`.
Each slot is a JSON string whose exact text serves as its revision. One store gives one atomic
`setItem` and one verification read under the existing bank lock, with no separate index that
can disagree with its board. Writers validate a fresh whole-store read, compare the target
slot with its last confirmed text, preserve other slot strings, recheck the store text, and
verify the write. Identical delivered retries are accepted. Different-attempt tabs merge
fresh slots; same-attempt stale boards are rejected. Completion removes only its slot after
the log confirms a terminal outcome. If deletion fails, the log still prevents resume.

An unfinished, consistent old checkpoint appears as a read-through slot when no new slot or
abandonment marker exists for its ID. Reading/opening does not migrate it. Every queued
recorder write checks for pending migration under the same lock, including feedback writes
without an open game, checkpoint writes, and explicit abandon. For checkpoint deletion,
including abandon, migration and deletion are computed in memory and the final store is
written and verified once. Other queued operations verify migration before they run.
The old key's exact text is kept even after verification, so a crash cannot discard the only
copy. New slots take precedence and concurrent migration is idempotent.
The old format has no checkpoint date; its migrated `updatedAt` uses stable attempt start time.
Corrupt, unknown-schema, or unreadable old/new storage blocks slot operations without repair.

Both list methods return `{ ok, items, count, code? }`. `listSlots` includes only resumable
slots, with `attemptId`, `updatedAt`, `mode`, `level`, and `effectiveMs`. `unfinishedSlots`
joins C2's player-scoped `unfinishedList` with slots, adding `resumable` and `reason`: `null`,
`missing_slot`, `inconsistent_slot`, or `abandoned`. C2 remains the source and ordering rule;
list activity dates and cumulative time come from the log. Read failures return `read_failed`.
Resume validates the full start identity and uses log time when the checkpoint is behind.

There is no hidden eviction or slot limit. Storage grows with full board/metadata snapshots,
the log, and small abandonment markers; each save reads and rewrites the slot store. Explicit
`abandon(id, playerId)` returns `{ ok, code? }`, removes only that new-store board copy, and
keeps a marker against old-key/stale-tab resurrection. It is idempotent, retains history, and
does not append `give_up` or infer failure. The C2 item stays unfinished but unresumable; play
again with a new attempt ID. The retained old checkpoint still occupies its original space.
Missing identity returns `identity_required`; an unknown/wrong-player ID returns `identity_mismatch`.

`flush()` now returns `{ ok: true }` or `{ ok: false, code }`, with `quota_exceeded` or
`write_failed`. Existing slots survive quota failure and failed work stays queued for retry.
`flush(true)` retains its previous success/rejection contract. A fresh recorder can list and
abandon slots to free space even when a playing recorder's queue is blocked. With a pending
old checkpoint, abandon writes only the final migrated-and-abandoned store, so it succeeds
when that store fits even if the expanded intermediate store would exceed quota. This applies
to abandoning either the old checkpoint or another slot. The retained old key still uses space,
and even an empty slot store needs room for its abandonment markers.

Ordinary checkpoint saves and record-event writes still persist pending migration first.
A smaller replacement checkpoint can therefore fit while that intermediate migration exceeds
quota. This is a known limitation outside the abandon/delete recovery path; use a fresh
recorder to abandon a checkpoint explicitly. Pending record events, including completion,
can also remain blocked by migration quota. Errors still reach `onError`; game actions receive
no storage exceptions.

Without Web Locks the queue guarantees **single-tab behavior only**. Records and slots are
not a crash-atomic transaction; a log-only attempt is unresumable and browser termination can
lose queued writes. Concurrent old/new application writers are not a supported synchronization
protocol. No visible slot picker or new game host wiring is added here.

## Rule values

All rule values live in `calibration.js`. The three unlock values below are signed off by William 2026-11-11; all other rows remain 待校準:

| Parameter                      | Initial rule                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `unlockInitialLevels`          | 3 initially open levels; signed off by William 2026-11-11                                                                  |
| `unlockRequiredHintFreeSolves` | 10 independent first solves without a star-key hint at the frontier; signed off by William 2026-11-11                      |
| `unlockMaxLevel`               | 8 maximum open level; signed off by William 2026-11-11                                                                     |
| `promotionWindow`              | Most recent 5 neighborhood attempts                                                                                        |
| `minimumSamples`               | 5 attempts before expansion                                                                                                |
| `independentRequired`          | At least 4 independent completes in that window                                                                            |
| `repeatedStruggle`             | 2 struggle reports block the candidate signal                                                                              |
| `neighborhoodTenths`           | ±3 tenths, using only present ratings                                                                                      |
| `stepsPerAdjustment`           | 1 next-present-rating step per adjustment, within the neighborhood                                                         |
| `familiarityLightRequired`     | 4 independent `light` completes for familiarity/Easy promotion; promotion must be from Medium                              |
| `NO_FEEDBACK_POLICY`           | Ignore absent feedback; do not infer any feeling                                                                           |
| `maxPerLevel`                  | 500, configurable with `--max-per-level`; stratify by in-level rating                                                      |
| `recentRecommendationLimit`    | Exclude the last 10 issued picks                                                                                           |
| `hardExplorationShare`         | 0.2 seeded branch for nearby unexplored buckets when an unstable frontier is available; bounded by the existing Hard range |
| `conservativeBucketCount`      | Use the lower 2 equally qualified buckets for Easy, upper 2 for Medium                                                     |
| `coldEasyBelow`                | Easy minimum: anchor lower bound minus 3 tenths, floored at 10                                                             |
| `coldEasyAboveL1`              | L1 Easy maximum: anchor lower bound plus 2 tenths; other levels stop at the anchor lower bound                             |
| `coldMediumAbove`              | Medium: anchor lower bound through +3 tenths, clipped to the anchor level                                                  |
| `coldHardAbove`                | Hard: Medium upper edge through anchor lower bound +6 tenths, clipped to the anchor level                                  |

The 4-of-5 rule is a candidate signal, not an Easy classifier or a future success probability. Missing feedback is not light feedback. Cold-start bands are priors, not mastery evidence. Synthetic player sequences verify these rules only; actual experience still needs play testing.

## Publish and read the sampled catalog

Run `npm run bank:publish` from the repository root. It downloads the four source files into a temporary directory outside the repo, verifies their Git blob hashes against the tree at `SOURCE_SHA`, and runs the existing importer. It writes only `src/bank/published/catalog-v1.json` into the repo. Temporary inputs are removed on completion. With existing pinned inputs, use `npm run bank:publish -- --input-dir /path/outside/repo`; the same remote tree verification still applies.

The default cap comes from `CALIBRATION.maxPerLevel` (500, 待校準 / 未簽核). `--max-per-level` and `--out` support measurements outside the repo. Output includes source provenance, catalog version, actual input/published counts by rating and level, and the calibration status. Serialization has no wall-clock fields; the same inputs and cap produce identical bytes. Unique-solution provenance remains the upstream claim described above.

The build validates the committed catalog and emits its bytes as `banks/<sha256>.json` in `release.assets`. The unchanged offline PREPARE/STAGE/ACTIVATE flow downloads, hashes, caches, repairs, and activates this asset with the complete release. A failed catalog download keeps the old release active. This additional asset is downloaded on an app update; only the existing NYT `release.bank` has cross-release reuse in the current offline implementation.

The build injects `globalThis.__sudokuBankCatalog`, a descriptor with the asset path, SHA-256, and document release identity. `await loadPublished()` from `loadPublished.js` reads that exact prepared release from Cache API, checks the bytes and catalog semantics, and returns the immutable verified catalog accepted by selection. It makes no network request and has no fallback to another release. Call it after successful offline preparation. The NYT `__sudokuPuzzleBank` global and reader keep their current contract; App and Journal do not call the new loader.

For cold download measurements, run `node scripts/measure-bank-release.mjs /path/to/baseline-build /path/to/new-build`. It uses fresh Chromium contexts and a local server with a shared bandwidth limit of 1.5 or 10 Mbps, 40 ms response latency, and raw or gzip (level 6) responses. The limit covers service-worker traffic. It reports release bytes, bytes including manifest/worker, total transferred bytes, and actual PREPARE completion time. The existing limits remain 60 s per download transaction and 125 s per command.

Manifest hashes prove that a file matches the manifest. They do not replace semantic Sudoku validation at build time. First launch must prepare the **complete published bank**, not one level at a time, before selection. Warm launch uses the verified local release without waiting for a background update. Keep existing staging, verification, activation, bound-version, and failed-update retention behavior. Do not swap catalog or puzzle snapshots during an active game.

Player records and recommendations belong to application storage, not the service-worker resource cache. Clearing resource cache must not delete them. Item 5, UI integration and end-to-end experience validation, waits for signed-off UI.

## D0: fixed manual order and per-mode starts

Manual L1–L8 now uses one shuffled order per catalog version and level, shared by every player. `fixedLevelOrder(catalog, level)` sorts boards by ``seedHash(`${catalogVersion}:${level}:${puzzleId}`)``, then by puzzle ID when hashes match. The read-only order is cached with the verified catalog's index. Player identity, history, seed, time, and call count cannot change that order. A new catalog version can change it.

Manual selection takes the first board in that order whose exact digits the player has not played. It skips active and paused boards. **Manual ignores the last ten recommendations**, including for replay proposals: a recommendation that was issued but never started repeats. This is the exception to the recent-pick exclusions described above. When no unseen board remains, selection returns `exhausted_in_range` and may propose the first inactive replay in the same order. A locked level still returns `level_locked`. Sequential selection keeps its rating-ascending order and recent-pick exclusion.

For a player with no ability evidence and no explicit `coldStart`, `selectPuzzle` uses Lizzy's reading of William's signed-off “1 2 3”: Easy starts at L1, Medium at L2, and Hard at L3. The mapping lives only in `CALIBRATION.coldStartLevels`. The existing formulas give these inclusive ranges before catalog gaps or the optional level clamp:

| Mode | Anchor | Rating tenths | In plain words |
| --- | --- | --- | --- |
| Easy | L1 | 10–12 | Ratings from 1.0 through 1.2 |
| Medium | L2 | 26–29 | Ratings from 2.6 through 2.9 |
| Hard | L3 | 35–38 | Ratings from 3.5 through 3.8 |

The recommendation context records the anchor used. Explicit `setColdStart(...)` level and experience settings keep their existing behavior for all modes. After any eligible ability evidence exists, selection uses the existing ability rules; these new defaults no longer apply. The ability API itself is unchanged. Its `provisional` flag means no promotion yet, so selection also checks for zero evidence. Legacy/NYT history supplies no ability evidence. There is no extra exclusion for NYT boards.

The formulas already produce nonempty bands for all eight anchors, including narrow L6: its Hard range is 68–69 (6.8–6.9), clipped at the level's upper bound. Existing lower fallback, clamp, and personalized sampling rules remain in use. The pre-index output tests still pin ability, records, and explicit Easy/Medium/Hard inputs; only the two manual selection digests now pin D0's order. The standalone old-baseline benchmark still expects the former manual behavior and is not a D0 equivalence check.

This is pure logic with no visible UI change. The fixed order, “1 2 3” starts, and ignored legacy history follow the signed-off decisions. Other numerical choices, including band widths, remain 待校準.

## Player API for the new UI

This is an opt-in bank data layer. It adds no visible UI, automatic restore, daily-puzzle
feedback use, upload, or aggregation. Importing the modules or creating a recorder does not
read or write storage. The host calls these functions only after bank opt-in. All selectors
accept projected schema-1 bank attempts and leave their inputs unchanged. They reject mixed
players, as unlock does. `levelList` also checks its explicit `playerId`. Custom and legacy
records belong to a later UI merge. C3 adds the multi-slot board store described above.

`player-api.js` exports four pure functions:

- `solveResult(attempts, attemptId, { previousMaxOpenLevel, frontier? })` describes a completed attempt.
  Pass the persisted maximum from **before** that completion. The result contains `level`,
  `mode`, `countsTowardUnlock`, `hintFreeSolvesAtLevel`, `required`, `justUnlockedLevel`
  (or null), and `levelSolvedDistinct`. It replays the existing unlock rule through that
  completion, ordered by `endedAt` and then attempt ID. Later completions and feedback do
  not change that result. Only a hint-free independent first solve at the then-highest open
  level supplies unlock credit. Replays and below-frontier solves carry zero progress.
  Pass `frontier: savedUnlock.frontier` with the saved maximum from before the completion.
  This opening boundary lets both result and persistence accumulate credit at an earned
  frontier even when a later calibration derives a lower maximum. Solves before that opening
  cannot gain credit retroactively. Retain the full log for first-attempt identity and counters.
  Progress is capped at the required 10; L8 cannot open L9. A hinted frontier completion can
  show the existing counter without adding to it. Distinct solved boards at the attempt's
  saved level include hinted completions and exclude replays. This count is available at
  L8 and below the highest open level. Missing, unfinished, or non-complete targets are errors.
- `levelList(catalog, attempts, level, { playerId })` requires the same verified catalog as
  selection. It returns `{ items, nextIndex, totals: { solved, total, inProgress } }`. Each
  item has `puzzle`, a 1-based `index`, `state` (`unsolved`, `solved`, `in_progress`, or
  `replaying`), `solvedAt`, and `solveMs`; missing solve values are null. A replaying item
  also has `bestMs`, which is the **saved solve's time**, not the fastest replay. Any completed
  attempt can mark its exact board digits or ID solved, across modes and catalog versions,
  including hinted and replay completions. Revealing an answer does not count. The earliest
  completion by `endedAt`, then attempt ID in code-unit order, is the saved solve. An active
  or paused attempt on a solved board shows `replaying`; an active board without a solve
  shows `in_progress`. A replay counts in both solved and in-progress totals. Items use
  `fixedLevelOrder`; `nextIndex` calls the real manual `selectPuzzle` and maps its selected
  board or replay proposal. It is null when no board is eligible. An exhausted replay proposal
  still requires an explicit replay choice. The host checks the persisted unlock
  maximum before offering a level; this list does not infer an unlock clamp.
- `unfinishedList(attempts)` returns `{ items, count }` for in-progress and paused bank
  attempts. Each item has `attemptId`, `startedAt`, `updatedAt`, `mode`, `level`, `effectiveMs`,
  and `replay`. Newest activity comes first, with equal times ordered by attempt ID. All five
  bank modes are supported. Resume updates the same attempt; a later complete removes it.
  No saved board is required. Listing an attempt does not promise that a resumable save exists.
- `dayStreak(attempts, { now, timeZone? })` returns `{ current, longest, todayDone }`. `now`
  is an injected millisecond timestamp. The timezone defaults to the device's local timezone;
  tests can supply an IANA timezone such as `Asia/Taipei` or `America/New_York`. Only completed
  Easy, Medium, and Hard attempts count, using `endedAt`; hinted completes count, replays do
  not. Manual L1–L8, sequential, Custom, answer reveals, and unfinished attempts do not count.
  Multiple completions on one local date count once. Current is the consecutive run ending
  today or yesterday. A missed today breaks the run only after today ends. Longest includes
  all past runs. Future completions are ignored. Calendar dates, not elapsed 24-hour periods,
  make the rule work across DST, year boundaries, and leap days.

Replay mapping: `game.startReplay` starts a separate replay only from a solved Journal view;
`resumeReplay` restores that replay. Journal's `replayState` retains the saved solve and requires
both a solved entry and a replay snapshot. The bank list mirrors the solved-plus-active state
and saved time, using exact board identity instead of date/difficulty. It needs no snapshot
because C3 owns save availability. There is one deliberate difference required by C2:
legacy `markSolved` replaces the stored solve when a replay completes, whereas this bank API
retains the earliest completed solve, even after faster or slower replays. `bestMs` is therefore
a compatibility label for that saved time, not a minimum. No Journal code or legacy storage
is read by these APIs.

`recorder.setFeedback(feedback, identity?)` sets or changes `light`, `some_effort`, or `struggle`.
`recorder.clearFeedback(identity?)` passes `feedback: undefined`. Omit identity for the current
game, or pass `{ attemptId, playerId }` for a historical attempt without opening a game. The
write checks fresh projected records under the same recorder queue and cross-tab lock. It
requires a finished attempt, zero star hints, and no answer reveal. A hint-free give-up is a
finished attempt and can receive feedback; an unfinished attempt cannot. Clear follows the
same guard, including for old hinted feedback. These guards are only on the new recorder
write path: `projectRecords`, schema 1, and projection of existing feedback remain unchanged.

Feedback methods return a promise of `{ ok, eventId?, code? }`; policy errors include
`attempt_not_finished`, `hint_used`, `answer_revealed`, and `player_mismatch`. Rejected input
does not block the queue. Storage failure returns `retry_pending`; the job retains its event
ID and `flush()` retries it. Exact delivered retries never replace feedback written later by
another tab. A new user change gets a new event ID. Errors do not throw into play; strict
`flush(true)` keeps its existing rejection behavior when persistence still fails. Feedback
remains local to the specified player and uses only `sudoku-bank-records-v1`.

`unlock-storage.js` exports `UNLOCK_KEY`, `readUnlockState(storage, playerId)`, and
`persistUnlockState(storage, attempts, { playerId, locks, policy?, now?, openLevel? })`. The only new storage key
is `sudoku-bank-unlock-v1`, with `{ schema: 1, playerId, maxOpenLevel, frontier, openings, policy }`.
`frontier` is the highest level's boundary; `openings` retains immutable per-level boundaries.
A boundary is `{ level, after: { endedAt, attemptId } }` for a solve-earned opening, or
`{ level, at }` for a non-solve opening. A completion counts strictly after its boundary:
completion time and then code-unit attempt ID for `after`, or strictly later milliseconds
for `at`. Initial L1–L3 receive fixed history-origin boundaries at 0, including empty initialization.
Every write that raises access records each newly opened level before a single verified write.

**Undated stored values are ignored.** `readUnlockState` returns
`{ status: "ignored", state: null }` for a valid schema-1 value with no boundary for its maximum.
It grants no stored high-water mark or unlock credit. There is no compatibility conversion,
cutoff inference, or recovery of an opening date from old history. Re-derive from projected
solve history through `deriveUnlockState` instead. A subsequent write replaces the ignored
value with that derived, dated state; its maximum can be lower than the ignored number.
Monotonic access applies to accepted dated states. Malformed values, unreadable storage,
wrong players, and unknown schemas still fail closed and are never treated as ignored data.

The writer re-reads the records inside the shared bank lock and projects the **full log for
this player** before deriving solve-earned openings. The caller's attempts may be stale and
are not the source of solve evidence. Persist record events before requesting an unlock
checkpoint. Missing records supply no solve evidence; unreadable records fail closed.
Stale-then-fresh and fresh-then-stale callers therefore save the same new boundaries from
the same canonical log, including after missing, empty-initialized, or ignored undated storage.
Already saved boundaries remain immutable.

Preserve **all levels earned by solves** before applying a non-solve opening request. Their
boundaries are the actual qualifying completion cursors, including
both the tenth L3 solve and the tenth L4 solve when checkpoint writes were delayed or failed.
A retry can persist L5 directly with both dates; missing observations never convert a normal
unlock to a write-time opening. An explicit `openLevel` request does not re-date a level that
was already earned by solves. `justUnlockedLevel` remains the level this solve opened, or null,
for the future UI's unlock animation.

`policy` records the three applied unlock-policy values. On an explicit policy transition,
the writer first preserves solve-earned progress under the previously saved policy, then
applies the new policy. If that transition itself opens an unearned next level, its boundary
is write time. Initial-level policy increases and explicit `openLevel` increases use the same
locked clock for levels not already earned. This separates a real policy change from a delayed
or failed checkpoint. Call the API when applying a policy change, before subsequent play.
An accepted dated value without policy metadata is evaluated with the supplied current policy;
missing metadata never implies a recalibration.

The injected `now()` defaults to `Date.now` and runs inside `sudoku-bank-writes-v1` only for a
non-solve opening. It must return a positive safe-integer timestamp. The boundary is clamped
to existing dates and known completed history so a backward clock cannot admit older locked
solves. An invalid or unavailable clock rejects that non-solve raise. Solve-earned openings
need no clock. A higher non-solve jump dates each newly opened level. Previously written
boundaries never move on retries, recalibration, or later lower-level play.

`projectPlayerUnlock` is the shared pure replay for solve results and persistence. It honors
dated boundaries, first-attempt identity, hints, answers, replays, and the running highest open
level. Pass the saved `frontier` to `solveResult`; a maximum without a date is ignored there
too and supplies only the history-derived result. No special numeric-only cutoff remains.
`validateUnlockFrontier` checks boundary format; read/write validation also rejects conflicting
or backwards dates. `deriveUnlockState` and `records.js` remain unchanged.

Persistence returns `{ ok: true, state }` or `{ ok: false, code, detail? }`. Every write reads
fresh, keeps accepted dated access monotonic with `mergeMaxOpenLevel`, validates the complete
payload, and verifies stored text. Retry failures with the same inputs. Unknown fields in
valid dated values survive. Feedback and unlock remain separate writes. No new storage key
is added, and unlock persistence never writes the bank event log.

Pass the host's Web Locks manager, or explicit `null` for the existing single-document
fallback. `write-lock.js` shares `withBankLock(locks, work)` between persistence and the
recorder; `BANK_LOCK` remains available from `recorder.js`. No global storage or lock manager
is used by the unlock adapter. No Web Locks means no cross-tab guarantee. Feedback and unlock
are separate writes, not a transaction. No new function reads or writes the four legacy keys.
The signed-off initial three levels, ten hint-free first solves, and L8 cap are unchanged;
other numerical rules in the Rule values section remain 待校準.
