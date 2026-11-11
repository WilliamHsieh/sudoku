import { describe, expect, it } from "vitest";
import { openCatalog } from "./catalog.js";
import { fixedLevelOrder, selectPuzzle } from "./select.js";
import { seedHash } from "./random.js";
import { attempt, catalogWith, puzzle } from "./test-fixtures.js";

const catalog = (await openCatalog(catalogWith([32, 44, 35, 38, 32, 40, 10, 85]))).catalog;
const options = {
  catalog,
  playerId: "alice",
  mode: /** @type {const} */ ("manual"),
  level: /** @type {const} */ (3),
  seed: "first",
};
const ordered = fixedLevelOrder(catalog, 3);

describe("fixed manual level order", () => {
  it("walks the same complete order for two players, regardless of seed or record order", () => {
    for (const playerId of ["alice", "bob"]) {
      const records = [];
      for (const [i, expected] of ordered.entries()) {
        const input = { ...options, playerId, records };
        const result = selectPuzzle(input);
        expect(result.status).toBe("selected");
        expect(result.puzzleId).toBe(expected.id);
        expect(result.reason.codes).toContain("fixed_level_order");
        expect(selectPuzzle(input)).toEqual(result);
        expect(selectPuzzle({ ...input, records: [...records].reverse() })).toEqual(result);
        for (const seed of [0, 12345, "another"])
          expect(selectPuzzle({ ...input, seed }).puzzleId).toBe(expected.id);
        records.push(attempt(i + 1, { playerId, puzzle: expected }));
      }
      expect(selectPuzzle({ ...options, playerId, records }).status).toBe("exhausted_in_range");
    }
  });

  it("uses catalog-version hash order, independent of catalog array order, and caches it", async () => {
    const hashes = ordered.map((p) => seedHash(`${catalog.catalogVersion}:3:${p.id}`));
    expect(hashes).toEqual([...hashes].sort((a, b) => a - b));
    expect(new Set(ordered.map((p) => p.id)).size).toBe(6);
    expect(ordered.every((p) => p.level === 3)).toBe(true);
    expect(fixedLevelOrder(catalog, 3)).toBe(ordered);
    expect(() => Array.prototype.pop.call(ordered)).toThrow();
    const reversed = (await openCatalog({ ...catalog, puzzles: [...catalog.puzzles].reverse() }))
      .catalog;
    expect(fixedLevelOrder(reversed, 3)).toEqual(ordered);
    expect(fixedLevelOrder(reversed, 3)).not.toBe(ordered);
    const next = (await openCatalog({ ...catalog, catalogVersion: "synthetic-v2" })).catalog;
    expect(fixedLevelOrder(next, 3).map((p) => p.id)).not.toEqual(ordered.map((p) => p.id));
  });

  it("breaks an actual hash collision by puzzle ID", async () => {
    const puzzles = [puzzle(27523, 32), puzzle(52393, 32)];
    const hashes = puzzles.map((p) => seedHash(`collision-v1:3:${p.id}`));
    expect(hashes).toEqual([120981894, 120981894]);
    const expected = puzzles.map((p) => p.id).sort();
    for (const boards of [puzzles, [...puzzles].reverse()]) {
      const opened = await openCatalog({
        ...catalogWith([]),
        catalogVersion: "collision-v1",
        puzzles: boards,
      });
      expect(fixedLevelOrder(opened.catalog, 3).map((p) => p.id)).toEqual(expected);
    }
  });

  it("skips exact played digits across versions and scopes played/active boards to the player", () => {
    const records = [
      attempt(1, {
        playerId: "alice",
        catalogVersion: "old-version",
        puzzle: { ...ordered[0], id: "f".repeat(40), ratingTenths: 10, level: 1 },
      }),
      attempt(2, { playerId: "bob", puzzle: ordered[1] }, "pause"),
    ];
    expect(selectPuzzle({ ...options, records }).puzzleId).toBe(ordered[1].id);
  });

  it.each(["in_progress", "paused"])(
    "skips %s boards for both unseen picks and replay proposals",
    (outcome) => {
      const records = [attempt(1, { playerId: "alice", puzzle: ordered[0] }, "pause")];
      records[0].outcome = /** @type {import('./types.js').Outcome} */ (outcome);
      expect(selectPuzzle({ ...options, records }).puzzleId).toBe(ordered[1].id);
      records.push(
        ...ordered.slice(1).map((p, i) => attempt(i + 2, { playerId: "alice", puzzle: p }))
      );
      const exhausted = selectPuzzle({ ...options, records });
      expect(exhausted.status).toBe("exhausted_in_range");
      expect(exhausted).not.toHaveProperty("puzzle");
      expect(exhausted.reason.codes).toContain("propose_replay_in_range");
      if (exhausted.status !== "selected") expect(exhausted.fallbackPuzzle?.id).toBe(ordered[1].id);
      for (const record of records)
        record.outcome = /** @type {import('./types.js').Outcome} */ (outcome);
      expect(selectPuzzle({ ...options, records })).not.toHaveProperty("fallbackPuzzle");
    }
  );

  it("repeats issued-but-unstarted picks and allows recent replay proposals", () => {
    const first = selectPuzzle(options);
    const recentRecommendations = Array.from({ length: 10 }, () => first);
    expect(selectPuzzle({ ...options, recentRecommendations }).puzzleId).toBe(first.puzzleId);
    const records = ordered.map((p, i) => attempt(i + 1, { playerId: "alice", puzzle: p }));
    const exhausted = selectPuzzle({ ...options, records, recentRecommendations });
    expect(exhausted.status).toBe("exhausted_in_range");
    if (exhausted.status !== "selected") expect(exhausted.fallbackPuzzle?.id).toBe(first.puzzleId);
  });

  it("honors the optional lock and never falls back outside an empty level", () => {
    expect(selectPuzzle({ ...options, maxOpenLevel: 2 })).toMatchObject({
      status: "level_locked",
      puzzleId: null,
      fallbackUsed: false,
    });
    expect(selectPuzzle({ ...options, maxOpenLevel: 2 })).not.toHaveProperty("fallbackPuzzle");
    expect(selectPuzzle({ ...options, maxOpenLevel: 3 }).puzzleId).toBe(ordered[0].id);
    const empty = selectPuzzle({ ...options, level: 2 });
    expect(empty.status).toBe("exhausted_in_range");
    expect(empty).not.toHaveProperty("fallbackPuzzle");
    expect(fixedLevelOrder(catalog, 2)).toEqual([]);
    expect(() => selectPuzzle({ ...options, level: undefined })).toThrow("requires a level");
  });
});
