# Phase-three benchmark and independent correctness check

Measured 2026-11-03T19:02:59.535Z to 2026-11-03T19:03:23.476Z on AMD EPYC 9V74 80-Core Processor, Node v24.22.1, Linux x64.

## Result

- 14,400 measured detector calls: 12 exact techniques × 3 genuinely different original puzzles × 2 outcomes × 200 calls. Five unrecorded warmups per board.
- Every technique has three found boards and three nontrivial no-step boards. No fabricated masks, symmetry duplicates, solved controls, errors, or timeouts in the measured corpus.
- Broad independent validation: 2,321 genuine states from 199 original puzzles, 27,852 detector queries and 29,173 emitted effects. No counterexamples, fixture errors, or inconclusive proofs.
- The explanation revision preserves every detector decision, effect and premise (including order) across all 27,852 genuine-state queries: 15,184 found steps and zero differences from initial head `5282924`.
- Actual built browser Worker measurements for the rewritten source are **pending CI**. The e2e test now attaches 800 requests, including real first-hint Medusa and Aligned Pair Exclusion, to the Playwright HTML artifact. The historical initial-head measurements below do not certify the revised source. Local Chromium cannot create its Unix singleton socket in this executor; Node timings are not substituted for browser timings.

## Exact-technique detector times (milliseconds)

Each outcome pools 600 individually timed calls from three original puzzles. The percentiles are nearest-rank empirical measurements. They describe these selected states, not a population tail or a phone guarantee. The timer includes input validation, detector traversal and explanation creation; it excludes fresh-array preparation and independent DLX proof. Those costs and Node IPC roundtrips are recorded separately in the raw report.

| Technique              | Found p50 |   p95 |   p99 | No-step p50 |    p95 |    p99 |
| ---------------------- | --------: | ----: | ----: | ----------: | -----: | -----: |
| wxyz-wing              |     0.432 | 0.634 | 1.108 |       4.182 |  5.898 |  7.662 |
| sue-de-coq             |     0.079 | 0.119 | 0.181 |       0.098 |  0.256 |  0.386 |
| 3d-medusa              |     0.228 | 0.436 | 0.568 |       0.211 |  0.557 |  0.947 |
| xy-chain               |     0.049 | 0.091 | 0.132 |       0.193 |  1.732 |  1.786 |
| als-xz                 |     0.292 | 1.163 | 1.274 |       0.854 |  1.287 |  1.503 |
| als-xy-wing            |     1.384 | 1.946 | 2.414 |       3.805 |  4.457 |  4.990 |
| death-blossom          |     0.435 | 1.371 | 1.657 |       1.446 |  1.803 |  2.082 |
| x-cycles               |     0.167 | 0.725 | 0.782 |       0.462 |  0.667 |  0.870 |
| grouped-x-cycles       |     0.230 | 0.656 | 0.777 |       1.799 |  2.426 |  2.995 |
| aic                    |     0.367 | 0.648 | 0.791 |      16.295 | 22.759 | 25.888 |
| aligned-pair-exclusion |     0.271 | 2.533 | 3.627 |       1.029 |  2.411 |  3.709 |
| rectangle-elimination  |     0.101 | 0.227 | 0.399 |       0.207 |  0.360 |  0.614 |

## Correctness and provenance

Numeric fixtures come from the user-supplied `sudoku-benchmark-raw-and-methods.zip`, the archived `sudokUI/corpus.json` and `sudokUI/selection.json`, pinned upstream data commit `5147ebe0040439bfa06595ab694d1ffdf3d8d2d1`. Upstream digit-minus-one masks were shifted left by one. No third-party detector source was copied. The raw benchmark subset contains 24 real candidate states; a separate genuine first-Medusa fixture supports narrow-viewport explanation tests; the broad validation used the full archived 2,321-state corpus. Original source hashes identify puzzle independence.

The new test-only oracle uses Algorithm X with dancing links and shares no completion-search code with the production MRV verifier. It independently rechecks exactly one completion for each original puzzle, consistency of placed values, candidate legality and retention of the original completion. For every emitted placement it searches for a completion without the digit; for every elimination it searches with that digit forced. A possible counterexample rejects the effect. Exhausting the 2,000,000-node query budget is inconclusive and rejected, not accepted as a proof. The recorded candidate elimination history is not replayed.

Regression tests also cover a truly multi-solution empty board, unsatisfiable input, oracle budget exhaustion, visibility filtering, input nonmutation and seeded candidate perturbations. This is strong semantic evidence on the supplied corpus, not a completeness proof for every strategy variant.

Search bounds remain explicit: X-Cycles/Grouped X-Cycles use at most 10 loop nodes (9 for discontinuities); XY-Chain uses 4–8 cells; basic AIC uses 6–12 nodes; alternating searches stop at 40,000 extensions. 3D Medusa covers rules 1–5 but not rule 6. ALSs have 1–4 cells, Death Blossom stems 2–4 digits, and Sue de Coq uses 2–3 intersection cells and 1–4 support cells. WXYZ-Wing is Type 1, and Aligned Pair Exclusion support ALSs have at most three cells. A no-step result means none found inside those implemented bounds, not logical absence of all family variants.

## Browser Worker measurement

Historical initial head `5282924b5e77a00ab39ac89863e4ad894dfaf236` passed [CI run 41690411312](https://github.com/WilliamHsieh/sudoku/actions/runs/41690411312) with 600 native Worker requests and zero errors/timeouts. Found p50/p95/p99/max were 61.3/121.8/175.2/248.4 ms; no-step were 100.0/153.8/185.5/223.0 ms. These are retained as initial implementation evidence only. The rewritten-source 800-request report will be attached by the new CI run; no current-source browser latency claim is made before that run completes.

`e2e/phase-three-worker-benchmark.spec.js` discovers the real hashed Worker URL from an application hint click, then creates a fresh native production Worker per request. Five genuine found cases exercise XY-Chain, basic AIC, Death Blossom, 3D Medusa and Aligned Pair Exclusion; three genuine incomplete no-step cases come from different original-unique puzzles. There are three warmups and 100 measurements per board, for 800 recorded requests. This expanded cohort is not directly comparable to the initial three-found cohort.

The measured browser path includes module initialization in a fresh JS context, structured cloning, fingerprint validation, Auto candidate handling, the full first-eligible strategy ladder, production semantic proof, response transfer and Worker teardown. Snapshot creation, provider receipt registration and UI rendering are outside that timer and are checked by the separate functional e2e tests. Browser HTTP/module cache is warm. Every returned proof variant is also checked with Algorithm X outside the timed region. Errors and the 3,000 ms watchdog are recorded as censored failures, never as no-step. CI may have ordinary shard CPU contention; the report records host and load metadata.

## Reproduce

- `npx vitest run src/hints/engine-phase-three.test.js`
- `node scripts/phase-three-validate.mjs` checks the tracked subset. Use `--corpus <converted-corpus.json>` for the complete archived input.
- `node scripts/phase-three-benchmark.mjs --samples 200 --warmups 5 --boards 3`
- `npx playwright test e2e/phase-three-worker-benchmark.spec.js --project=chromium` runs against the normal production build/preview.
- `node scripts/phase-three-worker-benchmark.mjs` is an additional dev-server harness for the complete provider roundtrip, including snapshot/receipt handling. It requires an available browser and is not the source of any claimed measurements yet.

The compact machine-readable report, full source hashes and per-board statistics are in `phase-three-benchmark-summary.json`. Generated raw samples, broad validation and baseline reconciliation reports are retained locally with reproducible commands above; transient raw files are not part of the production bundle.

## Measured source SHA-256

These hashes match the rewritten-source raw measurements, broad correctness validation and baseline-comparison report.

- `engine.js`: `5e086f780df3b2f0090bb274529b13a6ae08eb6ea84c66d50ff60df8b6e8a280`
- `engine-advanced.js`: `7b888a902168bfb6bf1dcc44bd5ef17ccc3e1c84440caff215f341452e5db45e`
- `engine-advanced-patterns.js`: `ab7adb6773b8e71f65157a07fd9452e5c90b025496cf4c66c29b7d8784ccf52a`
- `engine-advanced-chains.js`: `4c211397d32b0438dc7da15581a36e4a460c7c1a17139c9a67f8de3d89adf4f7`
- `engine-als.js`: `312605ff3299d2016f6b1ee748ab3eaf20238053cd564e8dc7b43d09a4914a8f`
- `proof-verifier.js`: `053b13f4c4f2041767077464a3aae90b9274e4a51bf918aa179437e1488fe1f6`
