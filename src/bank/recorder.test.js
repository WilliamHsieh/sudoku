import { expect, it, vi } from "vitest";
import { createRecorder, BANK_GAME_KEY, BANK_LOCK } from "./recorder.js";
import { memoryStorage, catalogWith } from "./test-fixtures.js";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { buildBankGameMeta } from "./game-meta.js";
import { readRecords, projectRecords, RECORDS_KEY } from "./records.js";
import { newGame } from "../game/game.js";
import { toSnapshot } from "../game/snapshot.js";

async function meta(id) {
  const { catalog } = await openCatalog(catalogWith([10]));
  return buildBankGameMeta(
    selectPuzzle({ catalog, playerId: "player", mode: "manual", level: 1, seed: id }),
    { attemptId: id, playerId: "player", source: catalog.source }
  );
}
function log(storage) {
  const result = readRecords(storage);
  if (result.status === "unreadable") throw Error(result.detail);
  return result.log;
}
function lockManager() {
  let tail = Promise.resolve();
  return {
    request: vi.fn((name, work) => {
      expect(name).toBe(BANK_LOCK);
      const result = tail.then(async () => {
        await Promise.resolve();
        return work();
      });
      tail = result.catch(() => {});
      return result;
    }),
  };
}
it("two contexts serialize interleaved appends with globally unique IDs", async () => {
  const storage = memoryStorage();
  const locks = lockManager();
  const onError = vi.fn();
  const a = createRecorder({ storage, locks, onError, now: () => 100 });
  const b = createRecorder({ storage, locks, onError, now: () => 10 });
  await Promise.all([a.open(await meta("a")), b.open(await meta("b"))]);
  a.begin();
  b.begin();
  for (let i = 1; i <= 10; i++) {
    a.hint();
    b.time(i);
    b.hint();
    a.time(i);
  }
  await Promise.all([a.flush(true), b.flush(true)]);
  const events = log(storage).events;
  expect(events).toHaveLength(42);
  expect(new Set(events.map((e) => e.id)).size).toBe(42);
  expect(projectRecords(log(storage)).map((a) => a.hintCount)).toEqual([10, 10]);
  expect(onError).not.toHaveBeenCalled();
  expect(locks.request).toHaveBeenCalled();
});
it("a write delivered before a verification failure retries with the same event ID", async () => {
  const storage = memoryStorage();
  const recorder = createRecorder({ storage, locks: lockManager(), onError: vi.fn() });
  await recorder.open(await meta("a"));
  recorder.begin();
  await recorder.flush(true);
  const read = storage.getItem;
  const write = storage.setItem;
  let failRead = false;
  storage.setItem = (key, value) => {
    write(key, value);
    failRead = true;
  };
  storage.getItem = (key) => {
    if (failRead) {
      failRead = false;
      throw Error("verification read blocked");
    }
    return read(key);
  };
  recorder.hint();
  await recorder.flush();
  storage.setItem = write;
  await recorder.flush(true);
  expect(log(storage).events.filter((e) => e.type === "hint")).toHaveLength(1);
  expect(projectRecords(log(storage))[0].hintCount).toBe(1);
});
it("a stale tab cannot overwrite the other tab's board", async () => {
  const storage = memoryStorage();
  const locks = lockManager();
  const data = await meta("a");
  const snapshot = toSnapshot(newGame(data.puzzle.digits));
  const a = createRecorder({ storage, locks, onError: vi.fn() });
  await a.open(data);
  a.begin();
  a.save(snapshot, 0);
  await a.flush(true);
  const errors = vi.fn();
  const b = createRecorder({ storage, locks, onError: errors });
  await b.open(null);
  b.begin(true);
  await b.flush(true);
  a.time(4);
  a.save(snapshot, 4);
  await a.flush(true);
  const saved = storage.getItem(BANK_GAME_KEY);
  b.time(5);
  b.save(snapshot, 5);
  await expect(b.flush(true)).rejects.toThrow(/Could not save/);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(saved);
  expect(errors).toHaveBeenCalled();
  expect(log(storage).events.filter((e) => e.type === "time")).toHaveLength(2);
});
it.each([BANK_GAME_KEY, RECORDS_KEY])("blocked reads never replace %s or crash", async (key) => {
  const storage = memoryStorage();
  const write = vi.spyOn(storage, "setItem");
  storage.getItem = (k) => {
    if (k === key) throw Error("blocked");
    return null;
  };
  const error = vi.fn();
  const r = createRecorder({ storage, locks: null, onError: error });
  expect(await r.open(await meta("a"))).toBe(null);
  expect(write).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalled();
});
it("corrupt records remain intact and block a new attempt", async () => {
  const storage = memoryStorage();
  storage.setItem(RECORDS_KEY, '{"schema":99}');
  const r = createRecorder({ storage, locks: null, onError: vi.fn() });
  expect(await r.open(await meta("a"))).toBe(null);
  expect(storage.getItem(RECORDS_KEY)).toBe('{"schema":99}');
  expect(storage.getItem(BANK_GAME_KEY)).toBe(null);
});
it("retries a bank checkpoint after its verification read failed", async () => {
  const storage = memoryStorage();
  const r = createRecorder({ storage, locks: null, onError: vi.fn() });
  const data = await meta("a");
  await r.open(data);
  r.begin();
  await r.flush(true);
  const read = storage.getItem,
    write = storage.setItem;
  let fail = false;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === BANK_GAME_KEY) fail = true;
  };
  storage.getItem = (key) => {
    if (fail) {
      fail = false;
      throw Error("verification failed");
    }
    return read(key);
  };
  r.save(toSnapshot(newGame(data.puzzle.digits)), 0);
  await r.flush();
  storage.setItem = write;
  await r.flush(true);
  expect(JSON.parse(read(BANK_GAME_KEY)).meta.attemptId).toBe("a");
});
it("an explicit new attempt may replace only a completed bank checkpoint", async () => {
  const storage = memoryStorage();
  const data = await meta("a");
  const a = createRecorder({ storage, locks: null, onError: vi.fn() });
  await a.open(data);
  a.begin();
  a.save(toSnapshot(newGame(data.puzzle.digits)), 0);
  await a.flush(true);
  const b = createRecorder({ storage, locks: null, onError: vi.fn() });
  expect(await b.open(await meta("b"))).toBe(null);
  a.complete(0);
  await a.flush(true);
  expect(await b.open(await meta("b"))).not.toBe(null);
  b.begin();
  b.save(toSnapshot(newGame(data.puzzle.digits)), 0);
  await b.flush(true);
  expect(JSON.parse(storage.getItem(BANK_GAME_KEY)).meta.attemptId).toBe("b");
  expect(log(storage).events.filter((e) => e.type === "start")).toHaveLength(2);
});
it("two resumed contexts retain every hint and time event for the same attempt", async () => {
  const storage = memoryStorage(),
    locks = lockManager(),
    onError = vi.fn();
  const data = await meta("shared");
  const a = createRecorder({ storage, locks, onError, now: () => 100 });
  await a.open(data);
  a.begin();
  a.save(toSnapshot(newGame(data.puzzle.digits)), 0);
  await a.flush(true);
  const b = createRecorder({ storage, locks, onError, now: () => 1 });
  await b.open(null);
  b.begin(true);
  await b.flush(true);
  a.time(10);
  b.time(4);
  a.hint();
  b.hint();
  a.hint();
  b.hint();
  await Promise.all([a.flush(true), b.flush(true)]);
  const events = log(storage).events;
  expect(events).toHaveLength(8);
  expect(new Set(events.map((e) => e.id)).size).toBe(8);
  expect(projectRecords(log(storage))[0]).toMatchObject({ hintCount: 4, effectiveMs: 10_000 });
  expect(onError).not.toHaveBeenCalled();
});
it("resume records the restored Notes mode when the log is ahead of the checkpoint", async () => {
  const storage = memoryStorage(),
    data = await meta("a");
  const a = createRecorder({ storage, locks: null, onError: vi.fn() });
  await a.open(data);
  a.begin();
  a.save(toSnapshot(newGame(data.puzzle.digits)), 0);
  await a.flush(true);
  a.settings("tidy");
  await a.flush(true);
  const b = createRecorder({ storage, locks: null, onError: vi.fn() });
  await b.open(null);
  b.begin(true);
  b.settings("auto");
  await b.flush(true);
  expect(
    projectRecords(log(storage))[0].settingsHistory.map((s) => s.settings.candidateMode)
  ).toEqual(["auto", "tidy", "auto"]);
});
