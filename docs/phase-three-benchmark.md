# Phase-three benchmark and independent correctness check

Measured 2026-11-03T18:00:52.540Z to 2026-11-03T18:01:12.609Z on AMD EPYC 9V74 80-Core Processor, Node v24.22.1, Linux x64.

## Result

- 14,400 measured detector calls: 12 exact techniques × 3 genuinely different original puzzles × 2 outcomes × 200 calls. Five unrecorded warmups per board.
- Every technique has three found boards and three nontrivial no-step boards. No fabricated masks, symmetry duplicates, solved controls, errors, or timeouts in the measured corpus.
- Broad independent validation: 2,321 genuine states from 199 original puzzles, 27,852 detector queries and 29,173 emitted effects. No counterexamples, fixture errors, or inconclusive proofs.
- Actual built browser Worker measurements are **pending CI**. The new e2e test attaches its raw 600-request report to the Playwright HTML artifact. Local Chromium cannot create its Unix singleton socket in this executor; Node timings are not substituted for browser timings.

## Exact-technique detector times (milliseconds)

Each outcome pools 600 individually timed calls from three original puzzles. The percentiles are nearest-rank empirical measurements. They describe these selected states, not a population tail or a phone guarantee. The timer includes input validation, detector traversal and explanation creation; it excludes fresh-array preparation and independent DLX proof. Those costs and Node IPC roundtrips are recorded separately in the raw report.

| Technique              | Found p50 |   p95 |   p99 | No-step p50 |    p95 |    p99 |
| ---------------------- | --------: | ----: | ----: | ----------: | -----: | -----: |
| wxyz-wing              |     0.385 | 0.535 | 0.747 |       3.263 |  5.423 |  6.100 |
| sue-de-coq             |     0.039 | 0.105 | 0.141 |       0.087 |  0.295 |  0.349 |
| 3d-medusa              |     0.138 | 0.340 | 0.457 |       0.209 |  0.484 |  0.569 |
| xy-chain               |     0.027 | 0.056 | 0.112 |       0.135 |  1.295 |  1.604 |
| als-xz                 |     0.223 | 1.104 | 1.204 |       0.863 |  1.280 |  1.614 |
| als-xy-wing            |     1.078 | 1.850 | 1.990 |       3.095 |  4.543 |  5.444 |
| death-blossom          |     0.385 | 1.271 | 1.658 |       1.139 |  1.782 |  2.514 |
| x-cycles               |     0.136 | 0.696 | 0.764 |       0.446 |  0.644 |  1.089 |
| grouped-x-cycles       |     0.188 | 0.636 | 0.727 |       1.537 |  2.454 |  3.014 |
| aic                    |     0.317 | 0.581 | 0.675 |      11.556 | 22.248 | 22.682 |
| aligned-pair-exclusion |     0.222 | 1.910 | 2.671 |       0.991 |  1.823 |  2.579 |
| rectangle-elimination  |     0.057 | 0.147 | 0.238 |       0.130 |  0.251 |  0.362 |

## Correctness and provenance

Numeric fixtures come from the user-supplied `sudoku-benchmark-raw-and-methods.zip`, the archived `sudokUI/corpus.json` and `sudokUI/selection.json`, pinned upstream data commit `5147ebe0040439bfa06595ab694d1ffdf3d8d2d1`. Upstream digit-minus-one masks were shifted left by one. No third-party detector source was copied. The tracked subset contains 24 real candidate states; the broad validation used the full archived 2,321-state corpus. Original source hashes identify puzzle independence.

The new test-only oracle uses Algorithm X with dancing links and shares no completion-search code with the production MRV verifier. It independently rechecks exactly one completion for each original puzzle, consistency of placed values, candidate legality and retention of the original completion. For every emitted placement it searches for a completion without the digit; for every elimination it searches with that digit forced. A possible counterexample rejects the effect. Exhausting the 2,000,000-node query budget is inconclusive and rejected, not accepted as a proof. The recorded candidate elimination history is not replayed.

Regression tests also cover a truly multi-solution empty board, unsatisfiable input, oracle budget exhaustion, visibility filtering, input nonmutation and seeded candidate perturbations. This is strong semantic evidence on the supplied corpus, not a completeness proof for every strategy variant.

Search bounds remain explicit: X-Cycles/Grouped X-Cycles use at most 10 loop nodes (9 for discontinuities); XY-Chain uses 4–8 cells; basic AIC uses 6–12 nodes; alternating searches stop at 40,000 extensions. 3D Medusa covers rules 1–5 but not rule 6. ALSs have 1–4 cells, Death Blossom stems 2–4 digits, and Sue de Coq uses 2–3 intersection cells and 1–4 support cells. WXYZ-Wing is Type 1, and Aligned Pair Exclusion support ALSs have at most three cells. A no-step result means none found inside those implemented bounds, not logical absence of all family variants.

## Browser Worker measurement

`e2e/phase-three-worker-benchmark.spec.js` discovers the real hashed Worker URL from an application hint click, then creates a fresh native production Worker per request. Three genuine found cases exercise XY-Chain, basic AIC and Death Blossom; three genuine incomplete no-step cases come from different original-unique puzzles. There are three warmups and 100 measurements per board.

The measured browser path includes module initialization in a fresh JS context, structured cloning, fingerprint validation, Auto candidate handling, the full first-eligible strategy ladder, production semantic proof, response transfer and Worker teardown. Snapshot creation, provider receipt registration and UI rendering are outside that timer and are checked by the separate functional e2e tests. Browser HTTP/module cache is warm. Every returned proof variant is also checked with Algorithm X outside the timed region. Errors and the 3,000 ms watchdog are recorded as censored failures, never as no-step. CI may have ordinary shard CPU contention; the report records host and load metadata.

## Reproduce

- `npx vitest run src/hints/engine-phase-three.test.js`
- `node scripts/phase-three-validate.mjs` checks the tracked subset. Use `--corpus <converted-corpus.json>` for the complete archived input.
- `node scripts/phase-three-benchmark.mjs --samples 200 --warmups 5 --boards 3`
- `npx playwright test e2e/phase-three-worker-benchmark.spec.js --project=chromium` runs against the normal production build/preview.
- `node scripts/phase-three-worker-benchmark.mjs` is an additional dev-server harness for the complete provider roundtrip, including snapshot/receipt handling. It requires an available browser and is not the source of any claimed measurements yet.

The compact machine-readable report, full source hashes and per-board statistics are in `phase-three-benchmark-summary.json`. Complete raw samples and broad validation evidence are retained in the review artifact; transient raw files are not part of the production bundle.

## Measured source SHA-256

These hashes match both final raw measurements and broad correctness validation.

- `engine.js`: `a8d5e6daae463e3d6a088e5ac41c05629b7dbf3beb32d64a7181be2924143010`
- `engine-advanced.js`: `7b888a902168bfb6bf1dcc44bd5ef17ccc3e1c84440caff215f341452e5db45e`
- `engine-advanced-patterns.js`: `b5c1c90d50f76e691c5da8b606006b1e80f7299d5058d6bc9353a21a32120a27`
- `engine-advanced-chains.js`: `ab81ca25c9ddc27d12abd765c88c1a4d163c3720ea4007a19d1fd47805fbad79`
- `engine-als.js`: `fc086a851608f54bc23c5294f1df3be13ee4a47d19530363890a055ec9b47a8d`
- `proof-verifier.js`: `43fced4c2b4182ee55ed638ab15f40636fd2e10f38b6af7288fbb329e9718be4`
