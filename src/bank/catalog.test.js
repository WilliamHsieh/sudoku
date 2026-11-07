import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SOURCE_SHA } from "./source.js";
import { grade } from "./grade.js";
import { parseLine, parseRating, puzzleId } from "./parse.js";
import { importCatalog } from "./import.js";
import { openCatalog, validateCatalog } from "./catalog.js";
import { fixtureCatalog, fixtureLines, source, puzzle } from "./test-fixtures.js";

describe("source parsing and product grading", () => {
  it.each([
    [10, 1],
    [25, 1],
    [26, 2],
    [31, 2],
    [32, 3],
    [44, 3],
    [45, 4],
    [55, 4],
    [56, 5],
    [64, 5],
    [65, 6],
    [69, 6],
    [70, 7],
    [84, 7],
    [85, 8],
    [999, 8],
  ])("%i grades as L%i", (rating, level) => {
    expect(grade(rating)).toBe(level);
  });
  it.each([9, 200, 25.999, NaN, Infinity])("rejects invalid integer tenths %s", (rating) =>
    expect(() => grade(rating)).toThrow()
  );
  it("accepts fixed-width source lines with or without a Unix newline", async () => {
    expect(await parseLine(fixtureLines[0])).toMatchObject({
      ok: true,
      puzzle: { ratingTenths: 10, level: 1 },
    });
    expect(await parseLine(fixtureLines[0] + "\n")).toEqual(await parseLine(fixtureLines[0]));
  });
  it.each([
    "2",
    "2.60",
    "2.61",
    "2e0",
    "-2.6",
    "2,6",
    "NaN",
    " 2.6 ",
    "0.9",
    "0.0",
    "20.0",
    "fail",
    "-1.0",
  ])("rejects bad rating %s", (rating) => expect(() => parseRating(rating)).toThrow());
  it("parses tenths without rounding a boundary", () => {
    expect(parseRating("2.6")).toBe(26);
    expect(parseRating("10.2")).toBe(102);
  });
  it("reports length, digit, hash, rating, and conflicting-given failures", async () => {
    const line = fixtureLines[0];
    for (const bad of [
      line.slice(1),
      line.slice(0, 13) + "x" + line.slice(14),
      "ffffffffffff" + line.slice(12),
      line.slice(0, 95) + "2.61",
    ]) {
      expect(await parseLine(bad)).toMatchObject({ ok: false });
    }
    const digits = "11" + "0".repeat(79);
    expect(
      await parseLine(`${(await puzzleId(digits)).slice(0, 12)} ${digits}  2.6`)
    ).toMatchObject({
      ok: false,
      error: "Conflicting givens",
    });
  });
  it("source bucket does not grade or allocate product difficulty", async () => {
    const { catalog } = await fixtureCatalog();
    expect(new Set(catalog.puzzles.map((p) => p.level)).size).toBe(8);
    expect(catalog.puzzles.every((p) => p.sourceBucket === "easy.txt")).toBe(true);
  });
});

describe("catalog publication", () => {
  it("excludes conflicting ratings, reports errors, and continues the batch", async () => {
    const { catalog, report } = await importCatalog(
      [fixtureLines[0], "bad", fixtureLines[0].slice(0, 95) + " 8.5", fixtureLines[2]].map(
        (line) => ({ line })
      ),
      { catalogVersion: "test", source }
    );
    expect(catalog.puzzles).toHaveLength(1);
    expect(report.errors.map((e) => e.code)).toEqual(["invalid_line", "rating_conflict"]);
    expect(catalog.puzzles.some((p) => p.digits === fixtureLines[0].slice(13, 94))).toBe(false);
  });
  it("caps every level and spreads across present ratings, including high ratings", async () => {
    const { catalog } = await fixtureCatalog(3);
    for (let level = 1; level <= 8; level++)
      expect(catalog.puzzles.filter((p) => p.level === level)).toHaveLength(3);
    expect(catalog.puzzles.filter((p) => p.level === 1).map((p) => p.ratingTenths)).toEqual([
      10, 16, 25,
    ]);
    expect(new Set(catalog.puzzles.map((p) => p.id)).size).toBe(catalog.puzzles.length);
    expect(new Set(catalog.puzzles.map((p) => p.digits)).size).toBe(catalog.puzzles.length);
  });
  it("takes all when below cap, independent of file order", async () => {
    const { catalog } = await fixtureCatalog();
    const reversed = await importCatalog(
      [...fixtureLines].reverse().map((line) => ({ line, sourceBucket: "easy.txt" })),
      { catalogVersion: "fixture-v1", source }
    );
    expect(catalog.puzzles).toHaveLength(58);
    expect(reversed.catalog).toEqual(catalog);
  });
  it("looks up stable identity and rejects corrupt or duplicate catalogs", async () => {
    const { catalog } = await fixtureCatalog();
    const index = await openCatalog(catalog);
    const p = catalog.puzzles[0];
    expect(index.byId(p.id)).toEqual(index.byDigits(p.digits));
    index.byId(p.id).digits = "bad";
    expect(index.byId(p.id)).toEqual(p);
    await expect(validateCatalog({ ...catalog, schema: 2 })).rejects.toThrow();
    await expect(validateCatalog({ ...catalog, puzzles: [p, p] })).rejects.toThrow("Duplicate");
    await expect(validateCatalog({ ...catalog, puzzles: [{ ...p, level: 8 }] })).rejects.toThrow();
    await expect(
      validateCatalog({
        ...catalog,
        puzzles: [{ ...p, id: "f".repeat(40), sourceHash: undefined }],
      })
    ).rejects.toThrow("Hash");
  });
  it("runs the CLI against caller paths with no network dependency", () => {
    const dir = mkdtempSync(join(tmpdir(), "sudoku-bank-test-"));
    try {
      const out = join(dir, "catalog.json");
      const report = JSON.parse(
        execFileSync(
          process.execPath,
          [
            "scripts/import-bank.mjs",
            "--catalog-version",
            "cli-v1",
            "--max-per-level",
            "2",
            "--out",
            out,
            "src/bank/fixtures/boundaries.txt",
          ],
          { encoding: "utf8" }
        )
      );
      expect(report.selected).toBe(16);
      const published = JSON.parse(readFileSync(out, "utf8"));
      expect(published.catalogVersion).toBe("cli-v1");
      expect(published.source).toMatchObject({
        gitSha: SOURCE_SHA,
        license: "Public domain",
        grader: { name: "Sukaku Explainer", version: "unknown", settings: "unknown" },
        verification: { method: "trusted_source", tool: "QQWing", version: SOURCE_SHA },
      });
      expect(() =>
        execFileSync(
          process.execPath,
          [
            "scripts/import-bank.mjs",
            "--catalog-version",
            "bad",
            "--out",
            out,
            "--source-sha",
            "0".repeat(40),
            "src/bank/fixtures/boundaries.txt",
          ],
          { stdio: "pipe" }
        )
      ).toThrow();
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(published);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("V1 catalog provenance and stratification", () => {
  it("uses the full board digest while checking the short source hash", async () => {
    const result = await parseLine(fixtureLines[0]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.puzzle.id).toHaveLength(40);
      expect(result.puzzle.sourceHash).toBe(result.puzzle.id.slice(0, 12));
      expect(result.puzzle.id).toBe(await puzzleId(result.puzzle.digits));
      expect(result.puzzle.id).not.toBe(result.puzzle.sourceHash);
    }
  });
  it("dedupes equal ratings but removes conflicts even after a cap would have been filled", async () => {
    const rows = [
      fixtureLines[0],
      fixtureLines[0],
      fixtureLines[1],
      fixtureLines[0].slice(0, 95) + " 8.5",
      fixtureLines[0],
    ];
    const { catalog, report } = await importCatalog(
      rows.map((line) => ({ line })),
      { source, catalogVersion: "conflict", maxPerLevel: 1 }
    );
    expect(report.errors.map((e) => e.code)).toEqual([
      "duplicate_board",
      "rating_conflict",
      "duplicate_board",
    ]);
    expect(report.conflictedBoards).toBe(1);
    expect(catalog.puzzles.every((p) => p.digits !== fixtureLines[0].slice(13, 94))).toBe(true);
    expect(report.input.perLevel[1]).toBe(1);
    expect(report.published.perRating[catalog.puzzles[0].ratingTenths]).toBe(1);
  });
  it("keeps scarce high in-level ratings despite a flood of low ratings", async () => {
    const boards = Array.from({ length: 50 }, (_, i) => puzzle(200 + i, 10));
    boards.push(puzzle(300, 24), puzzle(301, 25));
    const rows = boards.map((p) => ({
      line: `${p.id.slice(0, 12)} ${p.digits} ${(p.ratingTenths / 10).toFixed(1).padStart(4)}`,
    }));
    const { catalog, report } = await importCatalog(rows, {
      source: { ...source, unknown: { preserve: true } },
      catalogVersion: "flood",
      maxPerLevel: 6,
    });
    expect(catalog.puzzles).toHaveLength(6);
    expect(catalog.puzzles.map((p) => p.ratingTenths)).toContain(24);
    expect(catalog.puzzles.map((p) => p.ratingTenths)).toContain(25);
    expect(report.input.perRating).toEqual({ 10: 50, 24: 1, 25: 1 });
    expect(report.published.perRating).toEqual({ 10: 4, 24: 1, 25: 1 });
    expect(catalog.source.unknown).toEqual({ preserve: true });
    expect(catalog.ratingIndex[25]).toHaveLength(1);
    expect(catalog.levelIndex[1]).toEqual([10, 24, 25]);
  });
  it("preserves unknown catalog and puzzle fields and rejects corrupt indexes", async () => {
    const { catalog } = await fixtureCatalog();
    const value = {
      ...catalog,
      extension: { future: 1 },
      puzzles: catalog.puzzles.map((p) => ({ ...p, extra: "kept" })),
    };
    expect((await validateCatalog(value)).extension).toEqual({ future: 1 });
    expect((await validateCatalog(value)).puzzles[0].extra).toBe("kept");
    await expect(validateCatalog({ ...value, ratingIndex: { 10: [] } })).rejects.toThrow("index");
    const { catalog: opened } = await openCatalog(value);
    expect(() => {
      opened.puzzles[0].ratingTenths = 99;
    }).toThrow();
  });
});

it("excludes numeric and textual grader failures before publication", async () => {
  const { catalog, report } = await importCatalog(
    ["20.0", " 0.0", "fail", " NaN"].map((rating) => ({
      line: fixtureLines[0].slice(0, 95) + rating,
    })),
    { source, catalogVersion: "failures" }
  );
  expect(catalog.puzzles).toHaveLength(0);
  expect(report.errors).toHaveLength(4);
  expect(report.published.perLevel[8]).toBe(0);
});
