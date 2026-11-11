import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { openCatalog } from "./catalog.js";
import { catalogIndex } from "./indexes.js";
import { deriveAbility } from "./ability.js";
import { projectRecords } from "./records.js";
import { selectPuzzle } from "./select.js";
import { catalogWith } from "./test-fixtures.js";
import { benchmarkFixture, equivalenceCases } from "../../scripts/bank-benchmark-fixtures.mjs";

// SHA-256 over JSON.stringify outputs from master 399edbab4ff2f33773de8f6374a992620ec189f6.
// The shared input has hintCount, so the selection history token compares identical inputs.
// Fixture generation is deterministic; no Git executable or old checkout is needed in CI.
const expected = {
  "120-easy": {
    ability: "2564b6686b89a2858f1ee6f6917ff7f82fb74dc8bfa9cb0b2e4da2b32a84bf09",
    selection: "a529bb07fb1e675bc3b57945e785e585a8678dcca5a88641ac1f3f22903ae1a3",
    records: "d1e1891a49433cfe58e5180aa6529abd7b5975c02bddf98aadc13a8d4a8f7a42",
  },
  "120-medium": {
    ability: "2564b6686b89a2858f1ee6f6917ff7f82fb74dc8bfa9cb0b2e4da2b32a84bf09",
    selection: "0e572bc212aac20a7cd70f98acca4580344af53ad0763333ffa0d9ef82468c4c",
    records: "d1e1891a49433cfe58e5180aa6529abd7b5975c02bddf98aadc13a8d4a8f7a42",
  },
  "120-hard": {
    ability: "2564b6686b89a2858f1ee6f6917ff7f82fb74dc8bfa9cb0b2e4da2b32a84bf09",
    selection: "e63b576252f1d1c42d91bdc864b27fe40e1c1afa4dd0ae25ba6a45ceae355eee",
    records: "d1e1891a49433cfe58e5180aa6529abd7b5975c02bddf98aadc13a8d4a8f7a42",
  },
  "120-manual": {
    ability: "2564b6686b89a2858f1ee6f6917ff7f82fb74dc8bfa9cb0b2e4da2b32a84bf09",
    selection: "c28cd8ca5aeafb7f39c8908b469625ffbc6a6a83e0d8b11623797c7325bb9f4d",
    records: "d1e1891a49433cfe58e5180aa6529abd7b5975c02bddf98aadc13a8d4a8f7a42",
  },
  "600-easy": {
    ability: "b763c92cd95f4b72992c0b1f1138e57789f82ea5e10d08a2893a160870414a92",
    selection: "c4290bda93da0e40ed83094616a3bce261bead453d61249a308062c1e5c341b3",
    records: "d42bc324bb207e930190f0e9efce6a320c1a3bc3724d5ac5c9cec5e8c7458a9e",
  },
  "600-medium": {
    ability: "b763c92cd95f4b72992c0b1f1138e57789f82ea5e10d08a2893a160870414a92",
    selection: "d2a85cd9da8d2c1c4403d2c72773bf56505c8e0881993167a470142125d9aa0d",
    records: "d42bc324bb207e930190f0e9efce6a320c1a3bc3724d5ac5c9cec5e8c7458a9e",
  },
  "600-hard": {
    ability: "b763c92cd95f4b72992c0b1f1138e57789f82ea5e10d08a2893a160870414a92",
    selection: "120c7fe069441542c45cd1e7b10f845fa57d1cd6a8b0ba237fcaaa1679ede0b6",
    records: "d42bc324bb207e930190f0e9efce6a320c1a3bc3724d5ac5c9cec5e8c7458a9e",
  },
  "600-manual": {
    ability: "b763c92cd95f4b72992c0b1f1138e57789f82ea5e10d08a2893a160870414a92",
    selection: "e8ac538c9bb2d61586ac084e255860f201d5b8c42a3fccd80a5bf51999b4c7b2",
    records: "d42bc324bb207e930190f0e9efce6a320c1a3bc3724d5ac5c9cec5e8c7458a9e",
  },
};
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("catalog and history indexing", () => {
  it("reuses one read-only index per verified catalog and isolates catalog identities", async () => {
    const raw = catalogWith([45, 32, 32, 10]);
    const opened = await openCatalog(raw);
    const index = catalogIndex(opened.catalog);
    expect(catalogIndex(opened.catalog)).toBe(index);
    deriveAbility({ catalog: opened.catalog, playerId: "player" });
    selectPuzzle({
      catalog: opened.catalog,
      playerId: "player",
      mode: "manual",
      level: 3,
      seed: 1,
    });
    expect(catalogIndex(opened.catalog)).toBe(index);
    const second = await openCatalog(raw);
    expect(catalogIndex(second.catalog)).not.toBe(index);
    expect(index.byId(opened.catalog.puzzles[0].id)).toBe(opened.catalog.puzzles[0]);
    expect(index.byDigits(opened.catalog.puzzles[0].digits)).toBe(opened.catalog.puzzles[0]);
    expect(index.byLevel(3).map((p) => p.id)).toEqual(index.byRating(32).map((p) => p.id));
    expect(index.ratings).toEqual([10, 32, 45]);
    expect(() => Array.prototype.pop.call(index.byRating(32))).toThrow();
    expect(() => {
      Object.assign(index.ratings, { 0: 99 });
    }).toThrow();
    expect(() => Array.prototype.push.call(index.byLevel(8), opened.catalog.puzzles[0])).toThrow();
  });
  it("bounds neighborhood work even at the largest valid L8 rating", async () => {
    const catalog = (await openCatalog(catalogWith([85, Number.MAX_SAFE_INTEGER]))).catalog;
    const fixture = benchmarkFixture(1);
    const event = fixture.log.events[0];
    if (event.type !== "start") throw new Error("Expected start");
    event.start.puzzle = catalog.puzzles[1];
    const records = projectRecords(fixture.log);
    const ability = deriveAbility({ catalog, records, playerId: records[0].playerId });
    expect(ability.evidenceCount).toBe(1);
    expect(ability.neighborhoods.at(-1).firstValidAttemptCount).toBe(1);
    expect(ability.neighborhoods.at(-1).samples).toHaveLength(1);
  });
  it("does not cache a mutable raw catalog used by the ability API", () => {
    const catalog = catalogWith([10]);
    expect(catalogIndex(catalog).ratings).toEqual([10]);
    catalog.puzzles.push(catalogWith([45]).puzzles[0]);
    expect(catalogIndex(catalog).ratings).toEqual([10, 45]);
  });
  it("reads catalog entries once rather than searching them for every attempt", () => {
    const fixture = benchmarkFixture(400);
    const records = projectRecords(fixture.log);
    let reads = 0;
    const puzzles = new Proxy(fixture.catalog.puzzles, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads++;
        return Reflect.get(target, property, receiver);
      },
    });
    deriveAbility({ catalog: { ...fixture.catalog, puzzles }, records, playerId: "player" });
    expect(reads).toBe(fixture.catalog.puzzles.length);
  });
  it("projects a long log without scanning earlier attempts for each start", () => {
    const { log } = benchmarkFixture(400);
    const some = Array.prototype.some;
    let attemptScans = 0;
    const spy = vi.spyOn(Array.prototype, "some").mockImplementation(function (callback, thisArg) {
      if (this.length && this[0]?.attemptId && this[0]?.startedAt) attemptScans++;
      return some.call(this, callback, thisArg);
    });
    try {
      expect(projectRecords(log)).toHaveLength(400);
      expect(attemptScans).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  // Split modes so full-suite contention does not put many selections in one test timeout.
  it.each(
    [120, 600].flatMap((size) =>
      ["easy", "medium", "hard", "manual"].map((mode) => ({ size, mode }))
    )
  )(
    "matches pinned pre-index outputs byte-for-byte for $size records in $mode",
    async ({ size, mode }) => {
      const fixture = benchmarkFixture(size);
      const records = projectRecords(fixture.log);
      // Re-rating/removal is applied only to the current catalog; snapshots stay intact.
      fixture.catalog.puzzles = fixture.catalog.puzzles
        .slice(3)
        .map((p, i) => (i % 11 === 0 ? { ...p, ratingTenths: 45, level: 4 } : p));
      const catalog = (await openCatalog(fixture.catalog)).catalog;
      const cases = equivalenceCases(catalog, records).filter((input) => input.mode === mode);
      const pinned = expected[`${size}-${mode}`];
      expect(digest(cases.map((input) => deriveAbility(input)))).toBe(pinned.ability);
      expect(digest(cases.map((input) => selectPuzzle(input)))).toBe(pinned.selection);
      expect(
        digest(
          records.map((record) => {
            const copy = { ...record };
            delete copy.hintCount;
            return copy;
          })
        )
      ).toBe(pinned.records);
    }
  );
});
