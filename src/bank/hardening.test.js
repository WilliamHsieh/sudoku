import { describe, expect, it } from "vitest";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { applyEvent, projectRecords, readRecords, saveEvent, RECORDS_KEY } from "./records.js";
import { saveRecommendation, recentPicks, readRecommendations } from "./recommendations.js";
import { attempt, catalogWith, memoryStorage, puzzle, start } from "./test-fixtures.js";

const catalog = (await openCatalog(catalogWith([45, 35, 32, 44, 32, 10, 12, 26, 29, 48, 51, 85])))
  .catalog;
const base = { catalog, playerId: "player", seed: "fixed" };

describe("optional level clamp", () => {
  it("leaves legacy manual selection unclamped and returns a typed locked failure when requested", () => {
    expect(selectPuzzle({ ...base, mode: "manual", level: 4 }).status).toBe("selected");
    const result = selectPuzzle({ ...base, mode: "manual", level: 4, maxOpenLevel: 3 });
    expect(result.status).toBe("level_locked");
    expect(result.puzzleId).toBeNull();
    expect(result).not.toHaveProperty("fallbackPuzzle");
    expect(selectPuzzle({ ...base, mode: "manual", level: 3, maxOpenLevel: 3 }).status).toBe(
      "selected"
    );
  });
  it.each(["easy", "medium", "hard"])("clamps %s and stops when the band becomes empty", (mode) => {
    const options = {
      ...base,
      mode: /** @type {'easy'|'medium'|'hard'} */ (mode),
      coldStart: { kind: /** @type {const} */ ("level"), level: /** @type {const} */ (4) },
    };
    const unrestricted = selectPuzzle(options);
    expect(unrestricted.status).toBe("selected");
    const result = selectPuzzle({ ...options, maxOpenLevel: 3 });
    expect(result.candidateRange.max).toBe(44);
    if (mode === "easy") {
      expect(result.status).toBe("selected");
      if (result.status === "selected") expect(result.puzzle.level).toBeLessThanOrEqual(3);
    } else {
      expect(result.status).toBe("exhausted_in_range");
      expect(result).not.toHaveProperty("fallbackPuzzle");
    }
  });
  it.each(["easy", "medium", "hard"])(
    "keeps %s fallback and replay proposals below the clamp",
    (mode) => {
      const options = {
        ...base,
        mode: /** @type {'easy'|'medium'|'hard'} */ (mode),
        maxOpenLevel: /** @type {const} */ (3),
        coldStart: { kind: /** @type {const} */ ("level"), level: /** @type {const} */ (3) },
      };
      const records = catalog.puzzles.map((p, i) => attempt(i + 1, { puzzle: p }));
      for (const history of [[], records]) {
        const result = selectPuzzle({ ...options, records: history });
        const picked = result.status === "selected" ? result.puzzle : result.fallbackPuzzle;
        expect(picked?.level).toBeLessThanOrEqual(3);
      }
    }
  );
  it("clips learned Medium and Hard ranges that cross a level boundary", async () => {
    const catalog = (await openCatalog(catalogWith([32, 35, 38, 41, 43, 44, 45, 46]))).catalog;
    const records = [38, 41, 43].flatMap((rating, group) =>
      Array.from({ length: 5 }, (_, i) => {
        const number = 100 + group * 5 + i;
        return attempt(number, { mode: "hard", puzzle: puzzle(number, rating) });
      })
    );
    const options = {
      ...base,
      catalog,
      records,
      coldStart: { kind: /** @type {const} */ ("level"), level: /** @type {const} */ (3) },
    };
    expect(selectPuzzle({ ...options, mode: "hard" }).candidateRange).toEqual({ min: 43, max: 46 });
    const hard = selectPuzzle({ ...options, mode: "hard", maxOpenLevel: 3 });
    expect(hard.candidateRange).toEqual({ min: 43, max: 44 });
    expect(hard.selectedRatingBucket).toBeLessThanOrEqual(44);
    for (const rating of [44, 45])
      for (let i = 0; i < 5; i++) {
        const number = 200 + rating * 5 + i;
        records.push(attempt(number, { mode: "hard", puzzle: puzzle(number, rating) }));
      }
    expect(selectPuzzle({ ...options, mode: "medium" }).candidateRange.max).toBe(45);
    const medium = selectPuzzle({ ...options, mode: "medium", maxOpenLevel: 3 });
    expect(medium.candidateRange.max).toBe(44);
    expect(medium.selectedRatingBucket).toBeLessThanOrEqual(44);
  });
  it("preserves the existing lower fallback after Easy caution empties its band", () => {
    const records = [
      attempt(
        1,
        { puzzle: catalog.puzzles.find((p) => p.ratingTenths === 35), mode: "easy" },
        "give_up"
      ),
    ];
    const result = selectPuzzle({
      ...base,
      records,
      mode: "easy",
      coldStart: { kind: "level", level: 4 },
    });
    expect(result.status).toBe("selected");
    expect(result.reason.codes).toContain("conservative_unseen_range");
    expect(result.selectedRatingBucket).toBeLessThan(42);
  });
  it("rejects invalid clamps and keeps undefined identical to an omitted clamp", () => {
    expect(() =>
      selectPuzzle({ ...base, mode: "easy", maxOpenLevel: /** @type {never} */ (0) })
    ).toThrow();
    expect(selectPuzzle({ ...base, mode: "hard", maxOpenLevel: undefined })).toEqual(
      selectPuzzle({ ...base, mode: "hard" })
    );
  });
});

describe("sequential level selection", () => {
  const options = {
    ...base,
    mode: /** @type {const} */ ("sequential"),
    level: /** @type {const} */ (3),
  };
  const ordered = catalog.puzzles
    .filter((p) => p.level === 3)
    .sort((a, b) => a.ratingTenths - b.ratingTenths || a.id.localeCompare(b.id));
  it("orders rating then stable catalog ID, independent of seed and input order", async () => {
    const reversed = (await openCatalog({ ...catalog, puzzles: [...catalog.puzzles].reverse() }))
      .catalog;
    const records = [];
    for (const expected of ordered) {
      const result = selectPuzzle({ ...options, records });
      expect(result.puzzleId).toBe(expected.id);
      expect(selectPuzzle({ ...options, records, seed: "another" }).puzzleId).toBe(expected.id);
      expect(selectPuzzle({ ...options, records, catalog: reversed })).toEqual(result);
      records.push(attempt(records.length + 1, { puzzle: expected }));
    }
  });
  it("skips played, active, paused and recent boards, scoped to the player", () => {
    const records = [
      attempt(1, { puzzle: ordered[0] }),
      attempt(2, { puzzle: ordered[1] }, "pause"),
    ];
    records[1].outcome = "in_progress";
    expect(selectPuzzle({ ...options, records }).puzzleId).toBe(ordered[2].id);
    records[1].outcome = "paused";
    const recent = { ...selectPuzzle(options), puzzleId: ordered[2].id };
    expect(selectPuzzle({ ...options, records, recentRecommendations: [recent] }).puzzleId).toBe(
      ordered[3].id
    );
    records[0].playerId = "other";
    expect(selectPuzzle({ ...options, records }).puzzleId).toBe(ordered[0].id);
  });
  it("proposes the first eligible replay in the same level after exhaustion", () => {
    const records = ordered.map((p, i) => attempt(i + 1, { puzzle: p }));
    records[0].outcome = "paused";
    const result = selectPuzzle({ ...options, records });
    expect(result.status).toBe("exhausted_in_range");
    if (result.status !== "selected") expect(result.fallbackPuzzle?.id).toBe(ordered[1].id);
    expect(result.reason.codes).toContain("propose_replay_in_range");
    for (const record of records) record.outcome = "in_progress";
    expect(selectPuzzle({ ...options, records })).not.toHaveProperty("fallbackPuzzle");
  });
  it("requires a level and honors the optional lock", () => {
    expect(() => selectPuzzle({ ...options, level: undefined })).toThrow("requires a level");
    expect(selectPuzzle({ ...options, maxOpenLevel: 2 }).status).toBe("level_locked");
    expect(selectPuzzle({ ...options, maxOpenLevel: 3 }).status).toBe("selected");
  });
  it("round-trips sequential recommendations and attempts without a schema change", () => {
    const snapshot = selectPuzzle(options);
    const storage = memoryStorage();
    expect(
      saveRecommendation(storage, { id: "pick", playerId: "player", at: 1, snapshot }).ok
    ).toBe(true);
    const loaded = readRecommendations(storage);
    if (loaded.status !== "unreadable")
      expect(recentPicks(loaded.log, "player")).toEqual([snapshot]);
    if (snapshot.status !== "selected") throw new Error("Expected selected puzzle");
    const data = start(1, {
      mode: "sequential",
      puzzle: snapshot.puzzle,
      catalogVersion: snapshot.catalogVersion,
      reason: snapshot.reason,
      recommendation: snapshot,
    });
    const log = applyEvent(
      { schema: 1, events: [] },
      { id: "start", attemptId: data.attemptId, at: 1, type: "start", start: data }
    );
    expect(log.schema).toBe(1);
    expect(projectRecords(log)[0].mode).toBe("sequential");
  });
});

function startedLog() {
  const data = start(1);
  return applyEvent(
    { schema: 1, events: [] },
    { id: "start", attemptId: data.attemptId, at: 10, type: "start", start: data }
  );
}

describe("hint counts and fail-closed completion timestamps", () => {
  it("counts distinct hint IDs, preserves retries, and derives the same count after reload", () => {
    let log = startedLog();
    const hint = {
      id: "hint",
      attemptId: "attempt-1",
      at: 11,
      type: /** @type {const} */ ("hint"),
    };
    log = applyEvent(log, hint);
    log = applyEvent(log, hint);
    log = applyEvent(log, { ...hint, id: "hint-2", at: 12 });
    log = applyEvent(log, { ...hint, id: "end", at: 13, type: "complete" });
    expect(projectRecords(log)[0]).toMatchObject({
      hintCount: 2,
      hintUsed: true,
      outcome: "hinted_complete",
    });
    expect(projectRecords(JSON.parse(JSON.stringify(log)))).toEqual(projectRecords(log));
    expect(projectRecords({ ...log, events: [...log.events, hint] })).toEqual(projectRecords(log));
    const replay = start(2, { puzzle: start(1).puzzle });
    log = applyEvent(log, {
      id: "start",
      attemptId: replay.attemptId,
      at: 14,
      type: "start",
      start: replay,
    });
    log = applyEvent(log, { id: "hint", attemptId: replay.attemptId, at: 15, type: "hint" });
    expect(projectRecords(log).map((a) => [a.replay, a.hintCount])).toEqual([
      [false, 2],
      [true, 1],
    ]);
    expect(projectRecords(startedLog())[0]).toMatchObject({ hintCount: 0, hintUsed: false });
  });
  it("counts explicit star-key uses once per event ID and keeps omitted sources compatible", () => {
    const hint = {
      id: "star",
      attemptId: "attempt-1",
      at: 11,
      type: /** @type {const} */ ("hint"),
      source: "star",
    };
    let log = applyEvent(startedLog(), hint);
    log = applyEvent(log, hint);
    const { source, ...unlabelled } = hint;
    expect(source).toBe("star");
    log = applyEvent(log, { ...unlabelled, id: "second-star", at: 12 });
    log = applyEvent(log, { id: "end", attemptId: "attempt-1", at: 13, type: "complete" });
    expect(log.schema).toBe(1);
    expect(projectRecords(log)[0]).toMatchObject({
      hintCount: 2,
      hintUsed: true,
      outcome: "hinted_complete",
    });
    expect(projectRecords(JSON.parse(JSON.stringify(log)))).toEqual(projectRecords(log));
  });
  it.each(["fill", "hint_dot", "other"])(
    "ignores explicit non-star source %s without changing projection",
    (source) => {
      let log = startedLog();
      const initial = projectRecords(log);
      const assist = {
        id: "assist",
        attemptId: "attempt-1",
        at: 11,
        type: /** @type {const} */ ("hint"),
        source,
      };
      log = applyEvent(log, assist);
      expect(log.events).toHaveLength(2);
      expect(projectRecords(log)).toEqual(initial);
      expect(applyEvent(log, assist)).toEqual(log);
      expect(() => applyEvent(log, { ...assist, source: "star" })).toThrow("Conflicting");
      expect(() => applyEvent(log, { ...assist, id: "backdated", at: 9 })).toThrow("Out-of-order");
      log = applyEvent(log, { id: "end", attemptId: "attempt-1", at: 12, type: "complete" });
      const completed = projectRecords(log);
      expect(completed[0]).toMatchObject({
        hintCount: 0,
        hintUsed: false,
        outcome: "independent_complete",
      });
      log = applyEvent(log, { ...assist, id: "after-complete", at: 13 });
      expect(projectRecords(JSON.parse(JSON.stringify(log)))).toEqual(completed);
    }
  );
  it.each([null, 1, {}, ""])("rejects malformed hint source %j", (source) => {
    expect(() =>
      applyEvent(startedLog(), {
        id: "hint",
        attemptId: "attempt-1",
        at: 11,
        type: "hint",
        source: /** @type {never} */ (source),
      })
    ).toThrow("Invalid event");
  });
  it.each([0, -1, 9, 19, NaN, Infinity, 20.5])(
    "rejects invalid/backdated complete at %s before the terminal retry exception",
    (at) => {
      const log = applyEvent(startedLog(), {
        id: "give-up",
        attemptId: "attempt-1",
        at: 20,
        type: "give_up",
      });
      const before = JSON.stringify(log);
      expect(() =>
        applyEvent(log, { id: "complete", attemptId: "attempt-1", at, type: "complete" })
      ).toThrow();
      expect(JSON.stringify(log)).toBe(before);
      expect(projectRecords(log)[0]).toMatchObject({
        outcome: "gave_up",
        endedAt: 20,
        updatedAt: 20,
        effectiveMs: 0,
      });
    }
  );
  it("rejects pre-start completion on an active attempt and zero start timestamps", () => {
    const log = startedLog();
    expect(() =>
      applyEvent(log, { id: "end", attemptId: "attempt-1", at: 9, type: "complete" })
    ).toThrow();
    expect(() => projectRecords({ ...log, events: [{ ...log.events[0], at: 0 }] })).toThrow();
  });
  it("keeps exact same-ID retries idempotent after feedback; rejects conflicting retries", () => {
    const complete = {
      id: "end",
      attemptId: "attempt-1",
      at: 20,
      type: /** @type {const} */ ("complete"),
    };
    let log = applyEvent(startedLog(), complete);
    log = applyEvent(log, {
      id: "feeling",
      attemptId: "attempt-1",
      at: 21,
      type: "feedback",
      feedback: "light",
    });
    expect(applyEvent(log, complete)).toEqual(log);
    expect(() => applyEvent(log, { ...complete, at: 0 })).toThrow();
    expect(() => applyEvent(log, { ...complete, at: 22 })).toThrow("Conflicting");
    const resent = applyEvent(log, { ...complete, id: "new-id", at: 22 });
    expect(resent.events).toHaveLength(log.events.length + 1);
    expect(projectRecords(resent)).toEqual(projectRecords(log));
  });
  it("treats an invalid stored retry as unreadable and does not overwrite it", () => {
    const log = applyEvent(startedLog(), {
      id: "give-up",
      attemptId: "attempt-1",
      at: 20,
      type: "give_up",
    });
    const event = {
      id: "bad",
      attemptId: "attempt-1",
      at: 0,
      type: /** @type {const} */ ("complete"),
    };
    const storage = memoryStorage();
    const raw = JSON.stringify({ ...log, events: [...log.events, event] });
    storage.setItem(RECORDS_KEY, raw);
    expect(readRecords(storage).status).toBe("unreadable");
    expect(saveEvent(storage, { ...event, at: 21 }).ok).toBe(false);
    expect(storage.getItem(RECORDS_KEY)).toBe(raw);
  });
});
