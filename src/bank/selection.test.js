import { describe, expect, it } from "vitest";
import { deriveAbility, firstAttempts, setColdStart } from "./ability.js";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { projectRecords } from "./records.js";
import { attempt, catalogWith, puzzle, start } from "./test-fixtures.js";

const catalog = (
  await openCatalog(
    catalogWith([
      10, 12, 13, 15, 16, 19, 22, 25, 26, 29, 31, 32, 35, 44, 45, 48, 55, 56, 59, 64, 65, 68, 69,
      70, 73, 84, 85, 88,
    ])
  )
).catalog;
const base = { catalog, playerId: "player" };
/** @param {import('./types.js').Mode} mode @param {number} rating @param {number} [count] @param {import('./types.js').Feedback} [feedback] @param {number} [offset] */
function wins(mode, rating, count = 5, feedback, offset = 100) {
  return Array.from({ length: count }, (_, i) =>
    attempt(offset + i, { mode, puzzle: puzzle(offset + i, rating) }, "complete", feedback)
  );
}
/** @param {import('./types.js').Attempt[]} records */
const ability = (records) => deriveAbility({ ...base, records });
/** @param {import('./types.js').Attempt[]} records @param {import('./types.js').Mode} [mode] */
const select = (records, mode = "easy") =>
  selectPuzzle({ ...base, records, mode, seed: "repeatable" });

describe("synthetic player sequences", () => {
  it("uses the injected cold anchor, without experience labels or fixed mode-to-level mapping", () => {
    const coldStart = setColdStart({ kind: "level", level: 4 });
    const a = deriveAbility({ ...base, coldStart });
    expect(a.bands).toEqual({
      easy: { min: 42, max: 45 },
      medium: { min: 45, max: 48 },
      hard: { min: 48, max: 51 },
    });
    expect(
      deriveAbility({ ...base, coldStart: setColdStart({ kind: "experience", mapsToLevel: 4 }) })
    ).toEqual(a);
    expect(ability([]).bands).toEqual({
      easy: { min: 10, max: 12 },
      medium: { min: 10, max: 13 },
      hard: { min: 13, max: 16 },
    });
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("keeps initial Hard in anchor level %i", (level) => {
    const coldStart = setColdStart({
      kind: "level",
      level: /** @type {import('./types.js').Level} */ (level),
    });
    const result = selectPuzzle({ ...base, coldStart, mode: "hard", seed: 1 });
    if (result.status === "selected") expect(result.puzzle.level).toBe(level);
  });
  it("Easy wins alone never raise the Easy ceiling or other ranges", () => {
    expect(ability(wins("easy", 12, 30, "light")).bands).toEqual(ability([]).bands);
    // Even manually injected out-of-range Easy wins cannot upskill.
    expect(ability(wins("easy", 19, 10, "light")).bands).toEqual(ability([]).bands);
  });
  it("four independent Hard finishes among the latest five can enter Medium", () => {
    const records = wins("hard", 15, 4);
    records.push(attempt(104, { mode: "hard", puzzle: puzzle(104, 15) }, "give_up"));
    expect(ability(records).bands.medium.max).toBe(15);
    expect(ability(records).bands.hard).toEqual({ min: 15, max: 18 });
    expect(ability(records).promotions[0]).toMatchObject({
      code: "hard_entered_medium",
      ratingTenths: 15,
    });
    expect(ability(records).stableEasy).toEqual(ability([]).stableEasy);
  });
  it("requires five neighborhood attempts, not four wins alone", () => {
    expect(ability(wins("hard", 15, 4)).bands).toEqual(ability([]).bands);
  });
  it("repeated light Medium finishes alone promote the next Easy rating", () => {
    const records = wins("medium", 13, 5, "light");
    expect(ability(records).bands.easy.max).toBe(13);
    expect(ability(records).promotions.map((p) => p.code)).toContain("light_medium_entered_easy");
    expect(ability(wins("medium", 13)).bands.easy.max).toBe(12);
    expect(ability(wins("medium", 13, 5, "some_effort")).bands.easy.max).toBe(12);
  });
  it("supports Hard → Medium → Easy through fresh evidence at each step", () => {
    const records = [
      ...wins("hard", 15),
      ...wins("medium", 13, 5, "light", 110),
      ...wins("medium", 15, 5, "light", 120),
    ];
    expect(ability(records).bands.easy.max).toBe(15);
    expect(ability(records).bands.medium.max).toBe(16);
    expect(ability(records).promotions.map((p) => p.code)).toEqual([
      "hard_entered_medium",
      "light_medium_entered_easy",
      "light_medium_explored",
      "light_medium_entered_easy",
    ]);
  });
  it("different histories produce different ranges while a single outlier does not", () => {
    const learned = ability(wins("hard", 15));
    expect(learned.bands).not.toEqual(ability([]).bands);
    expect(ability(wins("hard", 88, 1)).bands).toEqual(ability([]).bands);
    expect(ability(wins("manual", 88, 10)).bands).toEqual(ability([]).bands);
    expect(
      ability([attempt(100, { mode: "hard", puzzle: puzzle(100, 15) }, "hint")]).bands
    ).toEqual(ability([]).bands);
  });
  it("hinted completions, answer views, pauses and repeated struggle do not certify independent ability", () => {
    for (const outcome of /** @type {const} */ (["hint", "reveal", "pause"])) {
      const records = Array.from({ length: 5 }, (_, i) =>
        attempt(100 + i, { mode: "hard", puzzle: puzzle(100 + i, 15) }, outcome)
      );
      expect(ability(records).bands).toEqual(ability([]).bands);
    }
    const records = wins("hard", 15);
    records[0].feedback = "struggle";
    records[1].feedback = "struggle";
    expect(ability(records).bands).toEqual(ability([]).bands);
    const onlyThree = wins("hard", 15, 3);
    onlyThree.push(
      attempt(103, { mode: "hard", puzzle: puzzle(103, 15) }, "hint"),
      attempt(104, { mode: "hard", puzzle: puzzle(104, 15) }, "hint")
    );
    expect(ability(onlyThree).bands.medium.max).toBe(13);
  });
  it("ignores replay wins and repeated attempt identities for upskilling", () => {
    const replays = wins("hard", 15).map((a) => ({ ...a, replay: true }));
    expect(ability(replays).bands).toEqual(ability([]).bands);
    const one = wins("hard", 15, 1)[0];
    expect(ability(Array(5).fill(one)).bands).toEqual(ability([]).bands);
    const sameBoard = wins("hard", 15).map((a) => ({ ...a, puzzle: one.puzzle }));
    expect(ability(sameBoard).bands).toEqual(ability([]).bands);
  });
  it.each([100, 99])("keeps primary evidence when a replay starts at %i", (replayAt) => {
    const primary = start(100, { attemptId: "z-first", mode: "medium", puzzle: puzzle(100, 12) });
    const replay = { ...primary, attemptId: "a-replay" };
    const records = projectRecords({
      schema: 1,
      events: [
        { id: "start", attemptId: primary.attemptId, at: 100, type: "start", start: primary },
        { id: "complete", attemptId: primary.attemptId, at: 101, type: "complete" },
        { id: "start", attemptId: replay.attemptId, at: replayAt, type: "start", start: replay },
        { id: "complete", attemptId: replay.attemptId, at: 102, type: "complete" },
      ],
    });
    expect(records.map((a) => a.replay)).toEqual([false, true]);
    expect(firstAttempts(records, "player").map((a) => a.attemptId)).toEqual(["z-first"]);
    expect(ability(records.slice(0, 1)).evidenceCount).toBe(1);
    expect(ability(records).evidenceCount).toBe(1);
  });
  it("uses recent five neighborhood attempts; unrelated ratings do not count", () => {
    const recentFailures = Array.from({ length: 5 }, (_, i) =>
      attempt(110 + i, { mode: "hard", puzzle: puzzle(110 + i, 15) }, "give_up")
    );
    // Three old wins, then failures, then one win: not four of the recent five.
    expect(
      ability([...wins("hard", 15, 3), ...recentFailures, ...wins("hard", 15, 1, undefined, 120)])
        .bands.medium.max
    ).toBe(13);
    expect(
      ability([
        ...wins("hard", 15, 4),
        attempt(120, { mode: "hard", puzzle: puzzle(120, 70) }, "give_up"),
      ]).bands.medium.max
    ).toBe(13);
    // Old failures do not block five new independent successes.
    expect(
      ability([...recentFailures, ...wins("hard", 15, 5, undefined, 120)]).bands.medium.max
    ).toBe(15);
  });
  it("consumes a proof window once and never leaps a rating gap", () => {
    expect(ability(wins("hard", 16)).bands.medium.max).toBe(15);
    const gaps = catalogWith([10, 12, 13, 19, 85]);
    expect(
      deriveAbility({ ...base, catalog: gaps, records: wins("hard", 19, 10) }).bands.medium.max
    ).toBe(13);
  });
  it("an explicit Easy failure narrows the next pick without resetting learned bands", () => {
    const learned = [...wins("hard", 15), ...wins("medium", 13, 5, "light", 110)];
    const failure = attempt(130, { mode: "easy", puzzle: puzzle(130, 13) }, "give_up");
    const next = ability([...learned, failure]);
    expect(next.bands.easy.max).toBe(12);
    expect(next.stableEasy.max).toBe(13);
    expect(next.bands.medium).toEqual(ability(learned).bands.medium);
    const result = select([...learned, failure]);
    expect(result.reason.codes).toContain("easy_failure_caution");
    if (result.status === "selected") expect(result.puzzle.ratingTenths).toBeLessThan(13);
    const recovery = attempt(131, { mode: "easy", puzzle: puzzle(131, 12) });
    expect(ability([...learned, failure, recovery]).bands.easy.max).toBe(13);
  });
  it("does not treat pauses, hints or a replay as Easy explicit failure", () => {
    expect(ability([attempt(100, { mode: "easy" }, "pause")]).easyCaution).toBe(false);
    expect(ability([attempt(100, { mode: "easy" }, "hint")]).easyCaution).toBe(false);
  });
  it("cannot upskill from unrated legacy/custom records or another player", () => {
    const unrated = /** @type {import('./types.js').Attempt[]} */ (
      /** @type {unknown} */ ([
        {
          playerId: "player",
          attemptId: "nyt",
          difficulty: "Hard",
          outcome: "independent_complete",
        },
        { playerId: "player", attemptId: "custom", digits: "0".repeat(81) },
      ])
    );
    expect(ability(unrated).bands).toEqual(ability([]).bands);
    expect(ability(wins("hard", 15).map((a) => ({ ...a, playerId: "other" }))).bands).toEqual(
      ability([]).bands
    );
  });
  it("manual finishes supply local evidence without bypassing promotion modes; speed never determines promotions", () => {
    expect(ability(wins("manual", 15)).bands.medium.max).toBe(13);
    expect(ability(wins("manual", 13, 5, "light")).bands.easy.max).toBe(12);
    const records = wins("hard", 15);
    const changed = records.map((a) => ({
      ...a,
      effectiveMs: 9000000,
      settings: { candidateMode: "auto" },
    }));
    expect(ability(changed).bands).toEqual(ability(records).bands);
  });
});

describe("Medium recalibration from sustained light completions", () => {
  it.each([
    { level: 1, rating: 12, ceiling: 13, next: 14 },
    { level: 4, rating: 47, ceiling: 48, next: 49 },
  ])(
    "advances L$level across a missing ceiling rating by one present step",
    async ({ level, rating, ceiling, next }) => {
      const local = (await openCatalog(catalogWith([rating, next, next + 1, 85]))).catalog;
      const options = {
        ...base,
        catalog: local,
        coldStart: setColdStart({
          kind: "level",
          level: /** @type {import('./types.js').Level} */ (level),
        }),
      };
      const records = wins("medium", rating, 4, "light");
      expect(deriveAbility({ ...options, records }).bands.medium.max).toBe(ceiling);
      // An unresolved fifth sample counts toward the window, but not as a completion.
      records.push(attempt(104, { mode: "medium", puzzle: puzzle(104, rating) }, "pause"));
      const learned = deriveAbility({ ...options, records });
      expect(learned.bands.medium.max).toBe(next);
      expect(learned.promotions).toContainEqual({
        code: "light_medium_explored",
        ratingTenths: next,
        attemptIds: records.map((a) => a.attemptId),
      });
      expect(learned.promotions.filter((p) => p.code === "light_medium_explored")).toHaveLength(1);
      const selected = selectPuzzle({ ...options, records, mode: "medium", seed: 1 });
      expect(selected.candidateRange.max).toBe(next);
      expect(selected.status).toBe("selected");
      // The same four-of-five completion sequence without light would remain at the prior.
      const withoutLight = records.map((a) => ({ ...a, feedback: undefined }));
      const control = deriveAbility({ ...options, records: withoutLight });
      expect(control.bands.medium.max).toBe(ceiling);
      expect(control.stableEasy).toEqual(deriveAbility(options).stableEasy);
      expect(control.neighborhoods.every((n) => n.classification !== "familiar")).toBe(true);
    }
  );
  it.each([undefined, "some_effort", "struggle"])(
    "does not treat %s feedback as light",
    (feedback) => {
      const records = wins(
        "medium",
        13,
        5,
        /** @type {import('./types.js').Feedback} */ (feedback)
      );
      expect(ability(records).bands).toEqual(ability([]).bands);
    }
  );
  it("requires four independent light completes and retains unresolved samples in the recent window", () => {
    const records = wins("medium", 13, 3, "light");
    records.push(attempt(103, { mode: "medium", puzzle: puzzle(103, 13) }, "hint", "light"));
    records.push(attempt(104, { mode: "medium", puzzle: puzzle(104, 13) }, "pause"));
    expect(ability(records).bands.medium.max).toBe(13);
    records.push(attempt(105, { mode: "medium", puzzle: puzzle(105, 13) }, "complete", "light"));
    expect(ability(records).bands.medium.max).toBe(13);
  });
  it("keeps repeated struggle in the recent window despite four light completions across history", () => {
    const records = [
      ...wins("medium", 13, 2, "light", 100),
      ...wins("medium", 13, 2, "struggle", 102),
      ...wins("medium", 13, 2, "light", 104),
    ];
    expect(ability(records).bands.medium.max).toBe(13);
  });
  it("does not leap a remote rating gap or use light wins outside the current Medium band", () => {
    const gaps = catalogWith([12, 19, 85]);
    expect(
      deriveAbility({ ...base, catalog: gaps, records: wins("medium", 12, 30, "light") }).bands
        .medium.max
    ).toBe(13);
    expect(ability(wins("medium", 15, 10, "light")).bands.medium.max).toBe(13);
  });
  it("consumes each window and requires fresh nearby evidence for another step", () => {
    const local = catalogWith([12, 14, 16, 19]);
    const records = wins("medium", 12, 5, "light");
    expect(deriveAbility({ ...base, catalog: local, records }).bands.medium.max).toBe(14);
    // More old-range wins cannot establish light evidence near the next target (1.6).
    records.push(...wins("medium", 12, 5, "light", 110));
    expect(deriveAbility({ ...base, catalog: local, records }).bands.medium.max).toBe(14);
    records.push(...wins("medium", 14, 5, "light", 120));
    expect(deriveAbility({ ...base, catalog: local, records }).bands.medium.max).toBe(16);
  });
});

describe("selection, gaps and exhaustion", () => {
  it("reproduces from inputs and seed, independent of catalog array order", async () => {
    const first = selectPuzzle({ ...base, mode: "hard", seed: "seed" });
    expect(selectPuzzle({ ...base, mode: "hard", seed: "seed" })).toEqual(first);
    expect(
      selectPuzzle({
        ...base,
        catalog: (await openCatalog({ ...catalog, puzzles: [...catalog.puzzles].reverse() }))
          .catalog,
        mode: "hard",
        seed: "seed",
      })
    ).toEqual(first);
    expect(first.ruleVersion).toBe("selection-v1");
    expect(first.reason.detail).toBeTruthy();
  });
  it("prefers unseen, including when an earlier attempt is paused", () => {
    const seen = catalog.puzzles[0];
    const result = select([attempt(100, { puzzle: seen }, "pause")]);
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.puzzle.id).not.toBe(seen.id);
  });
  it("proposes an explicit in-range replay after conservative unseen ranges are empty", () => {
    const records = catalog.puzzles
      .filter((p) => p.ratingTenths <= 12)
      .map((p, i) => attempt(100 + i, { mode: "easy", puzzle: p }));
    const result = select(records);
    expect(result.status).toBe("exhausted_in_range");
    expect(result.reason.codes).toContain("propose_replay_in_range");
    if (result.status === "exhausted_in_range")
      expect(result.fallbackPuzzle.ratingTenths).toBeLessThanOrEqual(12);
    expect(selectPuzzle({ ...base, records, mode: "easy", seed: 1 })).toMatchObject({
      status: "exhausted_in_range",
      mode: "easy",
    });
  });
  it("returns explicit exhaustion when all available ratings are above Easy", async () => {
    const result = selectPuzzle({
      ...base,
      catalog: (await openCatalog(catalogWith([15, 16, 85]))).catalog,
      mode: "easy",
      seed: 1,
    });
    expect(result).toMatchObject({ status: "exhausted_in_range", mode: "easy" });
    expect(result).not.toHaveProperty("puzzle");
    expect(result.reason.codes).toContain("manual_level_change_required");
  });
  it("uses existing ratings and explains the gap policy", async () => {
    const result = selectPuzzle({
      ...base,
      catalog: (await openCatalog(catalogWith([10, 13, 16]))).catalog,
      mode: "medium",
      seed: 1,
    });
    expect(result.status).toBe("selected");
    expect(result.reason.codes).toContain("rating_gap_stay_in_range");
    if (result.status === "selected") expect([10, 13]).toContain(result.puzzle.ratingTenths);
  });
  it("manual selection uses the chosen level and does not mutate ability or the active board", () => {
    const active = attempt(100, {}, "pause");
    const before = structuredClone(active);
    const previous = ability([active]);
    const result = selectPuzzle({ ...base, records: [active], mode: "manual", level: 8, seed: 1 });
    expect(result.status).toBe("selected");
    if (result.status === "selected") expect(result.puzzle.level).toBe(8);
    expect(active).toEqual(before);
    expect(ability([active])).toEqual(previous);
  });
  it("catalog replacement does not retarget a stored attempt or forget seen identity", async () => {
    const p = catalog.puzzles[0];
    const record = attempt(100, { puzzle: p });
    const next = (
      await openCatalog({
        ...catalog,
        ratingIndex: undefined,
        levelIndex: undefined,
        catalogVersion: "v2",
        puzzles: [{ ...p, ratingTenths: 12 }],
      })
    ).catalog;
    const result = selectPuzzle({
      ...base,
      catalog: next,
      records: [record],
      mode: "easy",
      seed: 1,
    });
    expect(result.reason.codes).toContain("propose_replay_in_range");
    expect(record.puzzle.ratingTenths).toBe(10);
    expect(record.catalogVersion).toBe("fixture-v1");
  });
});

describe("V1 evidence, filtering, and snapshots", () => {
  it("requires a catalog verified and frozen for this launch", () => {
    expect(() =>
      selectPuzzle({ ...base, catalog: catalogWith([10]), mode: "easy", seed: 1 })
    ).toThrow("verified catalog");
    expect(() => selectPuzzle({ ...base, catalog: { ...catalog }, mode: "easy", seed: 1 })).toThrow(
      "verified catalog"
    );
  });
  it("retains unresolved samples in the five-attempt window without treating them as fails or successes", () => {
    const pending = [104, 105].map((i) =>
      attempt(i, { mode: "hard", puzzle: puzzle(i, 15) }, "pause")
    );
    pending[1].outcome = "in_progress";
    const model = ability([...wins("hard", 15, 4), ...pending]);
    expect(model.bands.medium.max).toBe(15); // At attempt 104, four of five were independent.
    const blocked = ability([
      ...wins("hard", 15, 3),
      ...pending,
      ...wins("hard", 15, 1, undefined, 106),
    ]);
    expect(blocked.bands.medium.max).toBe(13);
    const n = blocked.neighborhoods.find((n) => n.ratingTenths === 15);
    expect(n).toMatchObject({
      firstValidAttemptCount: 6,
      independentComplete: 3,
      unresolved: 2,
      explicitFail: 0,
      solvabilityDenominator: 3,
      resolvedCount: 3,
      candidateSignal: false,
    });
    expect(n.feedback.missing).toBe(5);
    expect(n.samples).toHaveLength(6);
  });
  it("keeps hints, reveals, failures, feelings, settings, recency and replays separately", () => {
    const records = [
      attempt(100, { mode: "hard", puzzle: puzzle(100, 15) }, "complete", "some_effort"),
      attempt(101, { mode: "hard", puzzle: puzzle(101, 15) }, "hint", "light"),
      attempt(102, { mode: "hard", puzzle: puzzle(102, 15) }, "reveal"),
      attempt(103, { mode: "hard", puzzle: puzzle(103, 15) }, "give_up", "struggle"),
      attempt(104, { mode: "hard", puzzle: puzzle(104, 15) }, "pause"),
      attempt(105, { mode: "hard", puzzle: puzzle(105, 15), replay: true }),
    ];
    const n = ability(records).neighborhoods.find((n) => n.ratingTenths === 15);
    expect(n).toMatchObject({
      independentComplete: 1,
      hintedComplete: 1,
      viewedAnswer: 1,
      explicitFail: 1,
      unresolved: 1,
      replayCount: 1,
      feedback: { light: 1, some_effort: 1, struggle: 1, missing: 2 },
    });
    expect(n.samples[0].settingsHistory[0].settings.candidateMode).toBe("manual");
    expect(n.samples[0].updatedAt).toBe(records[0].updatedAt);
    expect(
      ability(wins("medium", 13)).neighborhoods.find((n) => n.ratingTenths === 13).classification
    ).toBe("insufficient_evidence");
  });
  it("does not use Medium records from before that range was admitted", () => {
    const records = [...wins("medium", 15, 5, "light"), ...wins("hard", 15, 5, undefined, 110)];
    expect(ability(records).bands.easy.max).toBe(12);
    expect(ability(records).bands.medium.max).toBe(15);
  });
  it("uses a conservative unseen range before proposing a replay", () => {
    const coldStart = setColdStart({ kind: "level", level: 2 });
    const records = catalog.puzzles
      .filter((p) => p.ratingTenths >= 23 && p.ratingTenths <= 26)
      .map((p, i) => attempt(200 + i, { puzzle: p, mode: "easy" }));
    const result = selectPuzzle({ ...base, records, coldStart, mode: "easy", seed: 1 });
    expect(result.status).toBe("selected");
    expect(result.fallbackUsed).toBe(true);
    expect(result.reason.codes).toContain("conservative_unseen_range");
    expect(result.selectedRatingBucket).toBeLessThan(23);
    expect(result.candidateRange.max).toBeLessThan(23);
  });
  it("never proposes an in-progress or paused board as a replay", () => {
    const records = catalog.puzzles
      .filter((p) => p.ratingTenths <= 12)
      .map((p, i) => attempt(200 + i, { puzzle: p }, "pause"));
    records[0].outcome = "in_progress";
    const result = select(records);
    expect(result.status).toBe("exhausted_in_range");
    expect(result).not.toHaveProperty("fallbackPuzzle");
  });
  it("excludes the last ten picks even if none were started, across modes", () => {
    const recent = catalog.puzzles
      .filter((p) => p.ratingTenths <= 12)
      .map((p) => ({
        ...selectPuzzle({ ...base, mode: "easy", seed: 1 }),
        puzzleId: p.id,
        selectedRatingBucket: p.ratingTenths,
      }));
    const exhausted = selectPuzzle({
      ...base,
      mode: "easy",
      seed: 1,
      recentRecommendations: recent,
    });
    expect(exhausted.status).toBe("exhausted_in_range");
    expect(exhausted).not.toHaveProperty("fallbackPuzzle");
    const old = catalog.puzzles[0];
    const history = [
      { ...recent[0], puzzleId: old.id },
      ...Array.from({ length: 10 }, () => ({ ...recent[0], puzzleId: catalog.puzzles.at(-1).id })),
    ];
    const result = selectPuzzle({ ...base, mode: "easy", seed: 1, recentRecommendations: history });
    expect(result.status).toBe("selected");
  });
  it("samples rating buckets before boards so a population flood cannot dilute Hard", async () => {
    const sparse = (await openCatalog(catalogWith([10, 13, 15, 16]))).catalog;
    const flooded = (
      await openCatalog({
        ...sparse,
        ratingIndex: undefined,
        levelIndex: undefined,
        puzzles: [...sparse.puzzles, ...Array.from({ length: 200 }, (_, i) => puzzle(200 + i, 13))],
      })
    ).catalog;
    const observed = new Set();
    for (let seed = 0; seed < 100; seed++) {
      const a = selectPuzzle({ ...base, catalog: sparse, mode: "hard", seed });
      const b = selectPuzzle({ ...base, catalog: flooded, mode: "hard", seed });
      expect(b.selectedRatingBucket).toBe(a.selectedRatingBucket);
      observed.add(b.selectedRatingBucket);
    }
    expect(observed).toEqual(new Set([13, 15, 16]));
  });
  it("ranks familiar, effortful and unstable neighborhoods before later priorities", async () => {
    const local = (await openCatalog(catalogWith([39, 42, 43, 45, 48, 49, 51, 85]))).catalog;
    const coldStart = setColdStart({ kind: "level", level: 4 });
    const options = { ...base, catalog: local, coldStart };
    const familiar = wins("manual", 39, 5, "light");
    for (let seed = 0; seed < 20; seed++) {
      const easy = selectPuzzle({ ...options, records: familiar, mode: "easy", seed });
      expect(easy.selectedRatingBucket).toBe(42);
      expect(easy.reason.codes).toContain("evidence_familiar");
    }
    const effort = wins("manual", 51, 5, "some_effort");
    const medium = selectPuzzle({ ...options, records: effort, mode: "medium", seed: 1 });
    expect(medium.selectedRatingBucket).toBe(48);
    expect(medium.reason.codes).toContain("evidence_solvable_effortful");
    const unstable = [attempt(100, { mode: "manual", puzzle: puzzle(100, 45) }, "give_up")];
    let frontierCount = 0;
    for (let seed = 0; seed < 100; seed++) {
      const hard = selectPuzzle({ ...options, records: unstable, mode: "hard", seed });
      expect([48, 49, 51]).toContain(hard.selectedRatingBucket);
      if (hard.selectedRatingBucket === 48) frontierCount++;
    }
    expect(frontierCount).toBeGreaterThan(60);
    expect(frontierCount).toBeLessThan(100);
  });
  it("freezes every recommendation field and leaves it unchanged after the next completion", () => {
    const result = selectPuzzle({ ...base, mode: "medium", seed: "snapshot" });
    expect(result).toMatchObject({
      mode: "medium",
      candidateRange: { min: 10, max: 13 },
      ruleVersion: "selection-v1",
      catalogVersion: catalog.catalogVersion,
      seed: "snapshot",
      fallbackUsed: false,
    });
    expect(result.historySnapshotVersion).toMatch(/^history-v1-/);
    expect(result.puzzleId).toHaveLength(40);
    expect(result.selectedRatingBucket).not.toBeNull();
    const before = JSON.stringify(result);
    selectPuzzle({ ...base, records: wins("hard", 15), mode: "medium", seed: "snapshot" });
    expect(JSON.stringify(result)).toBe(before);
    expect(() => {
      result.reason.codes.push("changed");
    }).toThrow();
    expect(() => {
      result.candidateRange.max = 99;
    }).toThrow();
  });
  it("does not retag re-rated evidence or resume boards by catalog array position", async () => {
    const records = wins("hard", 15);
    const next = (
      await openCatalog({
        ...catalog,
        ratingIndex: undefined,
        levelIndex: undefined,
        catalogVersion: "v2",
        puzzles: [...catalog.puzzles, ...records.map((a) => ({ ...a.puzzle, ratingTenths: 16 }))],
      })
    ).catalog;
    expect(deriveAbility({ ...base, catalog: next, records }).bands.medium.max).toBe(13);
    expect(records.every((a) => a.puzzle.ratingTenths === 15)).toBe(true);
  });
});
