import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createGame, DEMO_PUZZLE } from "../game/game.svelte.js";
import {
  customProgress,
  puzzleProgress,
  replayProgress,
  solvedPuzzles,
} from "../journal/progress.js";
import { timer, done } from "../store.js";
import { toSnapshot, fromSnapshot } from "../game/snapshot.js";
import { createHintSession } from "./session.svelte.js";
import { findHint } from "./engine.js";
import { registerVerifiedHint } from "./certificates.js";
import { hintStateKey } from "./hint.js";

let disk;
beforeEach(() => {
  disk = new Map();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => disk.set(key, value),
  });
  for (const store of [customProgress, puzzleProgress, replayProgress, solvedPuzzles])
    store.set({});
  timer.set(0);
  done.set(false);
});
afterEach(() => vi.unstubAllGlobals());
const provider = async (state) => {
  const hint = findHint(state);
  if (hint) registerVerifiedHint(hint, hintStateKey(state));
  return hint;
};
const sessionFor = (game) => createHintSession({ game, provider });
const info = { dateStr: "2026-11-12", difficulty: "easy" };

for (const kind of ["daily", "custom", "replay"]) {
  it.each([0, 1, 2])(
    `${kind} saves and restores reading stage %i without a board edit`,
    async (stage) => {
      const game = createGame();
      if (kind === "replay") solvedPuzzles.markSolved(info.dateStr, info.difficulty, 100);
      const options = kind === "custom" ? { custom: true } : { ...info, replay: kind === "replay" };
      game.load(DEMO_PUZZLE, options);
      const before = game.state;
      const session = sessionFor(game);
      await session.open();
      for (let n = 0; n < stage; n++) session.next();
      expect(game.state).toBe(before);
      expect(game.canUndo).toBe(false);
      const store =
        kind === "custom" ? customProgress : kind === "replay" ? replayProgress : puzzleProgress;
      const entry =
        kind === "custom" ? get(store).puzzles[DEMO_PUZZLE] : get(store)[info.dateStr].easy;
      expect(entry.snapshot.hintProgress.stage).toBe(stage);
      expect(entry.snapshot.version).toBe(1);
      const reopened = createGame();
      reopened.load(DEMO_PUZZLE, { ...options, ...entry });
      const reading = sessionFor(reopened);
      await reading.resume();
      expect(reading.status).toBe("ready");
      expect(reading.stage).toBe(stage);
      expect(reopened.state).toEqual(before);
      expect(reopened.canUndo).toBe(false);
      reading.close();
      const closed =
        kind === "custom" ? get(store).puzzles[DEMO_PUZZLE] : get(store)[info.dateStr].easy;
      expect(closed.snapshot.hintProgress).toBeUndefined();
    }
  );
}

it.each([
  undefined,
  null,
  {},
  { version: 2 },
  { stage: -1 },
  { stage: 3 },
  { stage: "1" },
  { identity: {} },
  { key: "different" },
])("ignores old/corrupt hint metadata %j and still restores the board", async (damage) => {
  const game = createGame();
  const session = sessionFor(game);
  await session.open();
  session.next();
  const snapshot = toSnapshot(game.state);
  // Simulate untrusted JSON without changing the supported board schema.
  // @ts-expect-error deliberate corrupt save from storage
  snapshot.hintProgress =
    damage === undefined || damage === null ? damage : { ...game.hintProgress, ...damage };
  // @ts-expect-error deliberate incomplete save from storage
  if (damage && Object.keys(damage).length === 0) snapshot.hintProgress = damage;
  const restored = fromSnapshot(snapshot);
  expect(restored).toEqual(game.state);
  game.load(DEMO_PUZZLE, { snapshot });
  await session.resume();
  expect(session.isOpen).toBe(false);
  expect(game.state).toEqual(restored);
});

it.each(["answer", "notes", "mode", "ledger"])(
  "discards reading position after a %s change, even after undo",
  async (change) => {
    const game = createGame();
    game.load(DEMO_PUZZLE, { custom: true });
    const session = sessionFor(game);
    await session.open();
    session.next();
    session.suspend();
    if (change === "answer") game.enter(0, 4);
    if (change === "notes") game.toggleNote(0, 4);
    if (change === "mode") game.setNotesMode("tidy");
    if (change === "ledger")
      game.commitStroke({
        ...game.state,
        trustedEliminations: { version: 1, valuesKey: DEMO_PUZZLE, removed: Array(81).fill(0) },
      });
    expect(get(customProgress).puzzles[DEMO_PUZZLE].snapshot.hintProgress).toBeUndefined();
    await session.resume();
    expect(session.isOpen).toBe(false);
    game.undo();
    await session.resume();
    expect(session.isOpen).toBe(false);
  }
);

it("keeps different slots separate even when their puzzle digits are identical", async () => {
  const game = createGame();
  const session = sessionFor(game);
  game.load(DEMO_PUZZLE, info);
  await session.open();
  session.next();
  const first = get(puzzleProgress)[info.dateStr].easy;
  game.load(DEMO_PUZZLE, { ...info, difficulty: "medium" });
  await session.resume();
  expect(session.isOpen).toBe(false);
  await session.open();
  session.next();
  session.next();
  game.load(DEMO_PUZZLE, { ...info, ...first });
  await session.resume();
  expect(session.stage).toBe(1);
  expect(get(puzzleProgress)[info.dateStr].medium.snapshot.hintProgress.stage).toBe(2);
});

it("does not overwrite a newer tab's saved reading position or board", async () => {
  const game = createGame();
  game.load(DEMO_PUZZLE, info);
  const session = sessionFor(game);
  await session.open();
  const remote = JSON.parse(disk.get("sudoku-progress"));
  remote[info.dateStr].easy.snapshot.hintProgress.stage = 2;
  const raw = JSON.stringify(remote);
  disk.set("sudoku-progress", raw);
  session.next();
  session.close();
  expect(disk.get("sudoku-progress")).toBe(raw);
  expect(() => game.flushProgress(true)).toThrow(/another tab/);
});

it("retains reading in memory on failed storage writes, with strict flush still failing", async () => {
  const game = createGame();
  game.load(DEMO_PUZZLE, { custom: true });
  const session = sessionFor(game);
  await session.open();
  const original = disk.get("sudoku-custom-progress");
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("full");
  });
  session.next();
  session.suspend();
  await session.resume();
  expect(session.stage).toBe(1);
  expect(disk.get("sudoku-custom-progress")).toBe(original);
  expect(() => game.flushProgress(true)).toThrow(/Storage/);
});

it("revalidates a persisted conclusion before applying it as a normal undoable move", async () => {
  const game = createGame();
  game.load(DEMO_PUZZLE, { custom: true });
  const session = sessionFor(game);
  await session.open();
  session.next();
  session.next();
  const snapshot = get(customProgress).puzzles[DEMO_PUZZLE].snapshot;
  game.load(DEMO_PUZZLE, { custom: true, snapshot });
  const before = game.state;
  await session.resume();
  session.apply();
  expect(session.status).toBe("applied");
  expect(game.state).not.toBe(before);
  expect(game.hintProgress).toBeNull();
  session.undo();
  expect(game.state).toBe(before);
  expect(session.isOpen).toBe(false);
});

it("restart clears a saved custom hint even when the board was already untouched", async () => {
  const game = createGame();
  game.load(DEMO_PUZZLE, { custom: true });
  const session = sessionFor(game);
  await session.open();
  session.next();
  session.suspend();
  game.restart();
  expect(get(customProgress).puzzles[DEMO_PUZZLE].snapshot.hintProgress).toBeUndefined();
  await session.resume();
  expect(session.isOpen).toBe(false);
});

it("does not apply an old conclusion into a newly loaded slot before reconciliation", async () => {
  const game = createGame();
  game.load(DEMO_PUZZLE, info);
  const session = sessionFor(game);
  await session.open();
  session.next();
  session.next();
  game.load(DEMO_PUZZLE, { ...info, difficulty: "medium" });
  const before = game.state;
  session.apply();
  expect(game.state).toBe(before);
  expect(session.isOpen).toBe(false);
});
