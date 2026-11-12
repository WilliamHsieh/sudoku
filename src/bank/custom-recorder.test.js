import { describe, expect, it } from "vitest";
import { createCustomRecorder, customPuzzles, CUSTOM_SAVES_KEY } from "./custom-recorder.js";
import { memoryStorage, puzzle } from "./test-fixtures.js";
import { newGame } from "../game/game.js";
import { toSnapshot } from "../game/snapshot.js";
import { BANK_LOCK } from "./write-lock.js";
const board = () => toSnapshot(newGame(puzzle(1).digits));
const recorder = (storage, locks = null) => createCustomRecorder({ storage, locks });
describe("custom multi-slot saves", () => {
  it("keeps separate starts of one board and restores the exact slot", async () => {
    const storage = memoryStorage();
    storage.setItem("sudoku-custom-progress", "untouched");
    const a = recorder(storage),
      b = recorder(storage);
    await a.open("a");
    a.save(board(), 12, false);
    await a.flush(true);
    await b.open("b", "NYT daily");
    b.save(board(), 40, false);
    await b.flush(true);
    const read = recorder(storage);
    expect((await read.list()).map((s) => s.attemptId).sort()).toEqual(["a", "b"]);
    expect(await read.open("a")).toMatchObject({ elapsed: 12, label: "Custom puzzle" });
    expect(storage.getItem("sudoku-custom-progress")).toBe("untouched");
    expect([...storage.data.keys()].filter((k) => k !== "sudoku-custom-progress")).toEqual([
      CUSTOM_SAVES_KEY,
    ]);
  });
  it("keeps two identical fresh starts through one recorder", async () => {
    const a = recorder(memoryStorage());
    for (const id of ["a", "b"]) {
      await a.open(id);
      a.save(board(), 0, false);
      await a.flush(true);
    }
    expect((await a.list()).map((s) => s.attemptId).sort()).toEqual(["a", "b"]);
  });
  it("uses the shared lock and removes completed slots from Unfinished", async () => {
    const names = [];
    const locks = {
      request: async (name, work) => {
        names.push(name);
        return work();
      },
    };
    const a = recorder(memoryStorage(), locks);
    await a.open("a");
    a.save(board(), 12, true);
    await a.flush(true);
    expect(await a.list()).toEqual([]);
    expect(names.every((name) => name === BANK_LOCK)).toBe(true);
  });
  it("retains a failed write for retry without reporting success", async () => {
    const storage = memoryStorage();
    const set = storage.setItem;
    const a = recorder(storage);
    await a.open("a");
    storage.setItem = () => {
      throw new Error("full");
    };
    a.save(board(), 12, false);
    await expect(a.flush(true)).rejects.toThrow("Could not save");
    storage.setItem = set;
    await a.flush(true);
    expect(await recorder(storage).open("a")).toMatchObject({ elapsed: 12 });
  });
  it("fails closed on corrupt data and stale same-slot writers", async () => {
    const storage = memoryStorage();
    storage.setItem(CUSTOM_SAVES_KEY, "broken");
    await expect(recorder(storage).list()).rejects.toThrow();
    expect(storage.getItem(CUSTOM_SAVES_KEY)).toBe("broken");
    const clean = memoryStorage();
    const a = recorder(clean),
      b = recorder(clean);
    await a.open("a");
    a.save(board(), 12, false);
    await a.flush(true);
    await b.open("a");
    a.save(board(), 20, false);
    await a.flush(true);
    b.save(board(), 30, false);
    await expect(b.flush(true)).rejects.toThrow();
    expect(await recorder(clean).open("a")).toMatchObject({ elapsed: 20 });
  });
  it("keeps the first-opened time across saves, and adopts it for older slots", async () => {
    const storage = memoryStorage();
    storage.setItem(
      CUSTOM_SAVES_KEY,
      JSON.stringify({
        schema: 1,
        slots: {
          old: {
            attemptId: "old",
            puzzle: board().puzzle,
            snapshot: board(),
            elapsed: 5,
            updatedAt: 1000,
            completed: false,
            label: "Custom puzzle",
          },
        },
      })
    );
    const a = recorder(storage);
    await a.open("old");
    a.save(board(), 9, false);
    await a.flush(true);
    expect(await recorder(storage).open("old")).toMatchObject({ elapsed: 9, createdAt: 1000 });
  });
});
describe("customPuzzles", () => {
  const slot = (attemptId, digits, createdAt, updatedAt, elapsed, completed, label) => ({
    attemptId,
    puzzle: digits,
    snapshot: toSnapshot(newGame(digits)),
    elapsed,
    createdAt,
    updatedAt,
    completed,
    ...(label ? { label } : {}),
  });
  const [p1, p2, p3] = [1, 2, 3].map((n) => puzzle(n).digits);
  it("keeps one record per board, numbered by first open; NYT keeps its label", () => {
    const items = customPuzzles([
      slot("replay", p2, 50, 60, 100, false, "Custom puzzle"),
      slot("first", p2, 20, 30, 442, true, "Custom puzzle"),
      slot("nyt", p3, 40, 41, 300, true, "NYT 2026-11-10 · Hard"),
      slot("start", p1, 10, 11, 12, false),
    ]);
    expect(items.map((i) => [i.name, i.title])).toEqual([
      ["Custom 1", "Custom 1"],
      ["Custom 2", "Custom 2"],
      ["Custom 3", "NYT 2026-11-10 · Hard"],
    ]);
    expect(items.map((i) => i.status)).toEqual(["in_progress", "replaying", "solved"]);
    expect(items[1].solves.map((s) => s.attemptId)).toEqual(["first"]);
    expect(items[1].active).toEqual({ attemptId: "replay", effectiveMs: 100000 });
    expect(items[0]).toMatchObject({ solves: [], active: { attemptId: "start" } });
  });
});
