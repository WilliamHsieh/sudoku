import { afterEach, expect, it, vi } from "vitest";
import { createGame, DEMO_PUZZLE } from "../game/game.svelte.js";
import { newGame } from "../game/game.js";
import { toSnapshot } from "../game/snapshot.js";
import { timer } from "../store.js";
import { createUpdateAction } from "../auto-update-browser.js";
import { createRecorder } from "./recorder.js";
import { buildBankGameMeta } from "./game-meta.js";
import { selectPuzzle } from "./select.js";
import { openCatalog } from "./catalog.js";
import { catalogWith, memoryStorage } from "./test-fixtures.js";
import { readRecords, projectRecords, RECORDS_KEY } from "./records.js";

const games = [];
const actions = [];
afterEach(() => {
  for (const action of actions.splice(0)) action.stop();
  for (const game of games.splice(0)) game.load(DEMO_PUZZLE);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function meta() {
  const { catalog } = await openCatalog(catalogWith([10]));
  return buildBankGameMeta(
    selectPuzzle({ catalog, playerId: "player", mode: "manual", level: 1, seed: "regression" }),
    { attemptId: "shared", playerId: "player", source: catalog.source }
  );
}
function locks() {
  let tail = Promise.resolve();
  return {
    request: vi.fn((_name, work) => {
      const result = tail.then(work);
      tail = result.catch(() => {});
      return result;
    }),
  };
}
function log(storage) {
  const result = readRecords(storage);
  if (result.status === "unreadable") throw Error(result.detail);
  return result.log;
}
async function contexts() {
  const storage = memoryStorage();
  const lock = locks();
  const errors = vi.fn();
  let clock = 1;
  const options = { storage, locks: lock, onError: errors, now: () => clock };
  const a = createRecorder(options);
  await a.open(await meta());
  a.begin();
  a.save(toSnapshot(newGame(a.meta.puzzle.digits)), 0);
  await a.flush(true);
  const b = createRecorder(options);
  await b.open(null);
  b.begin(true);
  await b.flush(true);
  return {
    a,
    b,
    storage,
    errors,
    setClock: (value) => {
      clock = value;
    },
  };
}

it("a held Update flush times out once and late completion cannot reload again", async () => {
  vi.useFakeTimers();
  let held = false;
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  const storage = memoryStorage();
  const lock = {
    request: async (_name, work) => {
      if (held) await gate;
      return work();
    },
  };
  const game = createGame({ storage, locks: lock, onError: vi.fn() });
  games.push(game);
  await game.startBank(await meta());
  held = true;
  timer.set(4);
  const reload = vi.fn();
  const flush = vi.fn(() => game.flushProgress(true));
  const onError = vi.fn();
  const setUpdating = vi.fn();
  const action = createUpdateAction({ flush, reload, onError, setUpdating });
  actions.push(action);
  action.run();
  action.run();
  await vi.advanceTimersByTimeAsync(1999);
  expect(reload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(reload).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(setUpdating).toHaveBeenLastCalledWith(false);
  action.run();
  expect(flush).toHaveBeenCalledOnce();
  held = false;
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(reload).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

it("a failed hint retries after another context advances time and unblocks later hints", async () => {
  const { a, b, storage, setClock } = await contexts();
  const write = storage.setItem;
  let failedId = "";
  storage.setItem = (key, value) => {
    if (key === RECORDS_KEY && !failedId) {
      failedId = JSON.parse(value).events.at(-1).id;
      throw Error("transient failure before write");
    }
    write(key, value);
  };
  setClock(10);
  a.hint();
  await a.flush();
  setClock(20);
  b.hint();
  await b.flush(true);
  storage.setItem = write;
  await a.flush(true);
  expect(projectRecords(log(storage))[0].hintCount).toBe(2);
  expect(log(storage).events.find((event) => event.id === failedId)).toMatchObject({
    at: 20,
    type: "hint",
  });
  a.hint();
  await a.flush(true);
  expect(projectRecords(log(storage))[0].hintCount).toBe(3);
});

it("a running context resumes shared state after another tab backgrounds, without wall time", async () => {
  const { a, b, storage, errors, setClock } = await contexts();
  setClock(10);
  b.time(1);
  await b.flush(true);
  setClock(20);
  a.lifecycle("background", 0);
  await a.flush(true);
  setClock(3_600_020); // A's paused wall-clock span is not effective play time.
  b.time(2);
  b.hint();
  await b.flush(true);
  a.time(3600); // A remains locally paused; its timer cannot add the absent span.
  await a.flush(true);
  const events = log(storage).events;
  const background = events.findIndex((event) => event.type === "background");
  expect(events.slice(background + 1).map((event) => event.type)).toEqual([
    "resume",
    "time",
    "hint",
  ]);
  expect(projectRecords(log(storage))[0]).toMatchObject({
    outcome: "in_progress",
    effectiveMs: 2000,
    hintCount: 1,
  });
  expect(errors).not.toHaveBeenCalled();
});

it("a delivered hint stays deduplicated when verification failed and another tab advanced time", async () => {
  const { a, b, storage, setClock } = await contexts();
  const read = storage.getItem;
  const write = storage.setItem;
  let failVerification = false;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === RECORDS_KEY) failVerification = true;
  };
  storage.getItem = (key) => {
    if (failVerification) {
      failVerification = false;
      throw Error("verification blocked after delivery");
    }
    return read(key);
  };
  setClock(10);
  a.hint();
  await a.flush();
  storage.setItem = write;
  setClock(20);
  b.hint();
  await b.flush(true);
  await a.flush(true);
  expect(
    log(storage)
      .events.filter((event) => event.type === "hint")
      .map((event) => event.at)
  ).toEqual([10, 20]);
  expect(projectRecords(log(storage))[0].hintCount).toBe(2);
});

it("a rejected Update flush keeps the existing error path and permits retry after recovery", async () => {
  vi.useFakeTimers();
  const flush = vi.fn(() => Promise.reject(Error("save rejected")));
  const reload = vi.fn();
  const onError = vi.fn();
  const action = createUpdateAction({ flush, reload, onError, setUpdating: () => {} });
  actions.push(action);
  action.run();
  await vi.advanceTimersByTimeAsync(0);
  expect(onError).toHaveBeenCalledExactlyOnceWith("save rejected");
  await vi.advanceTimersByTimeAsync(3000);
  expect(reload).not.toHaveBeenCalled();
  action.run();
  await vi.advanceTimersByTimeAsync(0);
  expect(flush).toHaveBeenCalledTimes(2);
  expect(reload).not.toHaveBeenCalled();
});

it("a conflicting event ID still fails closed instead of being treated as delivered", async () => {
  const storage = memoryStorage();
  const a = createRecorder({ storage, locks: null, uuid: () => "same-id", onError: vi.fn() });
  await a.open(await meta());
  a.begin();
  await a.flush(true);
  const before = storage.getItem(RECORDS_KEY);
  a.hint();
  await expect(a.flush(true)).rejects.toThrow();
  expect(storage.getItem(RECORDS_KEY)).toBe(before);
});
