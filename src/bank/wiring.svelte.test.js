import { afterEach, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createGame, DEMO_PUZZLE } from "../game/game.svelte.js";
import { createHintSession } from "../hints/session.svelte.js";
import { createPlay } from "../play/session.svelte.js";
import { timer } from "../store.js";
import { buildBankGameMeta } from "./game-meta.js";
import { selectPuzzle } from "./select.js";
import { openCatalog } from "./catalog.js";
import { catalogWith, memoryStorage } from "./test-fixtures.js";
import { readRecords, projectRecords, RECORDS_KEY } from "./records.js";
import { BANK_GAME_KEY } from "./recorder.js";
import { createUpdateAction } from "../auto-update-browser.js";

const games = [];
afterEach(() => {
  for (const game of games.splice(0)) game.load(DEMO_PUZZLE);
  vi.restoreAllMocks();
});
async function meta(id = "attempt-1") {
  const { catalog } = await openCatalog(catalogWith([10]));
  const selection = selectPuzzle({
    catalog,
    playerId: "player",
    records: [],
    recentRecommendations: [],
    coldStart: { kind: "level", level: 1 },
    mode: "easy",
    seed: "fixture",
  });
  return buildBankGameMeta(selection, {
    attemptId: id,
    playerId: "player",
    source: catalog.source,
  });
}
function setup(storage = memoryStorage()) {
  const onError = vi.fn();
  const game = createGame({ storage, locks: null, onError });
  games.push(game);
  return { game, storage, onError };
}
function log(storage) {
  const result = readRecords(storage);
  if (result.status === "unreadable") throw Error(result.detail);
  return result.log;
}
it("builds isolated metadata from a real selection and rejects an unselected result", async () => {
  const data = await meta();
  expect(data).toMatchObject({
    attemptId: "attempt-1",
    level: 1,
    mode: "easy",
    puzzleId: data.puzzle.id,
  });
  expect(data.recommendation.puzzleId).toBe(data.puzzle.id);
  // @ts-expect-error exercise invalid input at the API boundary
  expect(() => buildBankGameMeta({ status: "level_locked" }, {})).toThrow();
});
it.each([
  {},
  { dateStr: "day", difficulty: "easy" },
  { custom: true },
  { dateStr: "day", difficulty: "easy", replay: true },
])("legacy load %j never reads or writes bank keys", async (info) => {
  const storage = memoryStorage();
  const read = vi.spyOn(storage, "getItem");
  const write = vi.spyOn(storage, "setItem");
  const { game } = setup(storage);
  game.load(DEMO_PUZZLE, info);
  game.enter(0, 4);
  game.setNotesMode("manual");
  timer.set(30);
  game.bankHint();
  for (const type of /** @type {const} */ (["pause", "resume", "background", "close"]))
    game.bankLifecycle(type);
  await game.flushProgress();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it("persists edits, notes and elapsed time; explicit reload resumes the same attempt", async () => {
  const { game, storage, onError } = setup();
  const data = await meta();
  expect(await game.startBank(data)).toBe(true);
  game.setNotesMode("manual");
  game.toggleNote(80, 9);
  timer.set(12);
  game.bankLifecycle("background");
  await game.flushProgress(true);
  const checkpoint = JSON.parse(storage.getItem(BANK_GAME_KEY));
  game.load(DEMO_PUZZLE);
  await game.flushProgress(true);
  const resumed = setup(storage).game;
  expect(await resumed.startBank()).toBe(true);
  expect(resumed.bankMeta.attemptId).toBe(data.attemptId);
  expect(resumed.notesMode).toBe("manual");
  expect(resumed.hasNote(80, 9)).toBe(true);
  expect(get(timer)).toBe(12);
  expect(JSON.parse(storage.getItem(BANK_GAME_KEY)).snapshot).toEqual(checkpoint.snapshot);
  expect(log(storage).events.filter((e) => e.type === "start")).toHaveLength(1);
  expect(log(storage).events.at(-1).type).toBe("resume");
  expect([...storage.data.keys()].sort()).toEqual([BANK_GAME_KEY, RECORDS_KEY].sort());
  expect(onError).not.toHaveBeenCalled();
});
it("records only closed-to-open star panel uses, including an unavailable provider", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta());
  const hints = createHintSession({ game });
  await hints.open();
  await hints.open(); // already open; no second use
  hints.next();
  hints.close();
  await hints.open();
  hints.close();
  game.setNotesMode("manual");
  await hints.open(); // disabled
  game.setNotesMode("auto");
  game.fillSingles(); // completes; Fill is not a hint
  await game.flushProgress(true);
  const events = log(storage).events;
  expect(events.filter((e) => e.type === "hint")).toHaveLength(2);
  expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  expect(projectRecords(log(storage))[0]).toMatchObject({
    hintCount: 2,
    outcome: "hinted_complete",
  });
});
it("flushes time before pause/background/close, resumes, changes settings and completes once", async () => {
  const { game, storage, onError } = setup();
  await game.startBank(await meta());
  timer.set(5);
  game.bankLifecycle("pause");
  game.bankLifecycle("resume");
  timer.set(6);
  game.bankLifecycle("background");
  game.bankLifecycle("close");
  game.bankLifecycle("resume");
  game.setNotesMode("tidy");
  game.enter(80, 9);
  await game.flushProgress(true);
  await game.flushProgress(true);
  const events = log(storage).events;
  expect(events.filter((e) => e.type === "complete")).toHaveLength(1);
  expect(events.filter((e) => e.type === "time").map((e) => e.effectiveMs)).toEqual([5000, 6000]);
  expect(projectRecords(log(storage))[0]).toMatchObject({
    effectiveMs: 6000,
    outcome: "independent_complete",
    settings: { candidateMode: "tidy" },
  });
  expect(onError).not.toHaveBeenCalled();
});
it("restart clears the board clock but keeps cumulative effort and hint evidence", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta());
  timer.set(7);
  game.bankHint();
  game.restart();
  timer.set(2);
  game.fillSingles();
  await game.flushProgress(true);
  expect(projectRecords(log(storage))[0]).toMatchObject({ effectiveMs: 9000, hintCount: 1 });
});
it.each(['{"schema":99}', "{bad", '{"schema":1}'])(
  "unknown/corrupt bank data is ignored and never overwritten: %s",
  async (raw) => {
    const storage = memoryStorage();
    storage.setItem(BANK_GAME_KEY, raw);
    const { game, onError } = setup(storage);
    expect(await game.startBank()).toBe(false);
    expect(await game.startBank(await meta())).toBe(false);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
    expect(storage.getItem(RECORDS_KEY)).toBe(null);
    expect(game.bankMeta).toBe(null);
    expect(onError).toHaveBeenCalled();
  }
);
it("storage failure leaves gameplay usable; Update waits for successful retry before reload", async () => {
  const { game, storage, onError } = setup();
  await game.startBank(await meta());
  const write = storage.setItem;
  storage.setItem = () => {
    throw Error("disk full");
  };
  expect(() => game.enter(80, 9)).not.toThrow();
  const reload = vi.fn();
  const updateError = vi.fn();
  const action = createUpdateAction({
    flush: () => game.flushProgress(true),
    reload,
    setUpdating: () => {},
    onError: updateError,
  });
  action.run();
  await vi.waitFor(() => expect(updateError).toHaveBeenCalled());
  expect(reload).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalled();
  storage.setItem = write;
  await game.flushProgress(true);
  expect(projectRecords(log(storage))[0].outcome).toBe("independent_complete");
  action.stop();
});
it("Update waits for a held cross-tab lock before invoking reload", async () => {
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  let block = false;
  const locks = {
    request: async (_name, work) => {
      if (block) await held;
      return work();
    },
  };
  const storage = memoryStorage();
  const game = createGame({ storage, locks, onError: vi.fn() });
  games.push(game);
  await game.startBank(await meta());
  block = true;
  timer.set(4);
  const reload = vi.fn();
  const action = createUpdateAction({
    flush: () => game.flushProgress(true),
    reload,
    setUpdating: () => {},
  });
  action.run();
  await Promise.resolve();
  expect(reload).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(projectRecords(log(storage))[0].effectiveMs).toBe(4000);
  action.stop();
});

it("the 30-second single-cell hint dot and Fill never record a hint", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta());
  let now = 0;
  const play = createPlay({ live: false, now: () => now });
  play.bindLones(() => [80]);
  play.noteActivity();
  now = 30_000;
  play.step();
  expect(play.phase).toBe("flash");
  game.fillSingles();
  await game.flushProgress(true);
  expect(projectRecords(log(storage))[0]).toMatchObject({
    hintCount: 0,
    outcome: "independent_complete",
  });
});
it("loading a legacy game detaches bank recording and leaves its checkpoint unchanged", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta());
  timer.set(3);
  game.load(DEMO_PUZZLE);
  await game.flushProgress(true);
  const before = [...storage.data.entries()];
  game.enter(0, 4);
  timer.set(10);
  game.bankHint();
  game.bankLifecycle("close");
  await game.flushProgress(true);
  expect([...storage.data.entries()]).toEqual(before);
});
it("restoring a checkpoint with changed attempt identity fails closed", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta());
  game.load(DEMO_PUZZLE);
  await game.flushProgress(true);
  const checkpoint = JSON.parse(storage.getItem(BANK_GAME_KEY));
  checkpoint.meta.playerId = "different-player";
  const damaged = JSON.stringify(checkpoint);
  storage.setItem(BANK_GAME_KEY, damaged);
  const resumed = setup(storage).game;
  expect(await resumed.startBank()).toBe(false);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(damaged);
});
it("new metadata after completion starts a new attempt without reusing the old ID", async () => {
  const { game, storage } = setup();
  await game.startBank(await meta("first"));
  game.fillSingles();
  expect(await game.startBank(await meta("second"))).toBe(true);
  expect(game.solved).toBe(false);
  expect(projectRecords(log(storage)).map((a) => a.attemptId)).toEqual(["first", "second"]);
});
