import { describe, expect, it, vi } from "vitest";
import { attempt, memoryStorage, puzzle } from "./test-fixtures.js";
import { storeCompletedAttempts } from "./unlock-test-fixtures.js";
import { persistUnlockState, readUnlockState, UNLOCK_KEY } from "./unlock-storage.js";
import { solveResult } from "./player-api.js";
import { BANK_LOCK } from "./write-lock.js";

const options = { playerId: "player", locks: null, now: () => 1 };
const wins = (first, count, rating) =>
  Array.from({ length: count }, (_, i) =>
    attempt(first + i, { puzzle: puzzle(first + i, rating) })
  );
function saved(storage) {
  const read = readUnlockState(storage, "player");
  if (read.status !== "ok") throw Error("Saved state required");
  return read.state;
}
function result(history, state) {
  return solveResult(history, history.at(-1).attemptId, {
    previousMaxOpenLevel: state.maxOpenLevel,
    frontier: state.frontier,
  });
}
function sharedLocks() {
  let tail = Promise.resolve();
  const locks = {
    held: false,
    request: vi.fn((name, work) => {
      expect(name).toBe(BANK_LOCK);
      const task = tail.then(() => {
        locks.held = true;
        try {
          return work();
        } finally {
          locks.held = false;
        }
      });
      tail = task.catch(() => {});
      return task;
    }),
  };
  return locks;
}

describe("dated openings on every path", () => {
  it("initializes empty L5 before play and counts all ten future solves", async () => {
    const storage = memoryStorage(),
      history = [];
    expect(
      await persistUnlockState(storage, history, { ...options, policy: { unlockInitialLevels: 5 } })
    ).toMatchObject({
      ok: true,
      state: {
        maxOpenLevel: 5,
        frontier: { level: 5, at: 1 },
        openings: { 4: { level: 4, at: 1 }, 5: { level: 5, at: 1 } },
      },
    });
    await persistUnlockState(storage, history, options);
    for (let i = 1; i <= 10; i++) {
      const before = saved(storage);
      history.push(...wins(i, 1, 56));
      expect(result(history, before)).toMatchObject({
        countsTowardUnlock: true,
        hintFreeSolvesAtLevel: i,
        justUnlockedLevel: i === 10 ? 6 : null,
      });
      await persistUnlockState(storage, history, options);
    }
    expect(saved(storage).maxOpenLevel).toBe(6);
  });

  it.each(["policy", "external"])(
    "does not recycle locked L5 solves after an opening by %s",
    async (path) => {
      const storage = memoryStorage(),
        history = [...wins(1, 1, 13), ...wins(10, 10, 56)];
      await persistUnlockState(storage, history, options);
      const request =
        path === "policy"
          ? { policy: { unlockInitialLevels: 5, unlockRequiredHintFreeSolves: 20 } }
          : { openLevel: 5 };
      await persistUnlockState(storage, history, { ...options, ...request, now: () => 2000 });
      expect(saved(storage)).toMatchObject({ maxOpenLevel: 5, frontier: { at: 2000 } });
      await persistUnlockState(storage, history, options);
      expect(saved(storage).maxOpenLevel).toBe(5);
      for (let i = 1; i <= 10; i++) {
        const before = saved(storage);
        history.push(...wins(29 + i, 1, 56));
        expect(result(history, before)).toMatchObject({
          hintFreeSolvesAtLevel: i,
          justUnlockedLevel: i === 10 ? 6 : null,
        });
        await persistUnlockState(storage, history, options);
      }
      expect(saved(storage).maxOpenLevel).toBe(6);
    }
  );

  it("stamps a calibration crossing based on already-observed history and blocks a cascade", async () => {
    const storage = memoryStorage(),
      history = [...wins(1, 10, 32), ...wins(20, 10, 45)];
    await persistUnlockState(storage, history, {
      ...options,
      policy: { unlockRequiredHintFreeSolves: 20 },
    });
    expect(saved(storage).maxOpenLevel).toBe(3);
    await persistUnlockState(storage, history, { ...options, now: () => 4000 });
    expect(saved(storage)).toMatchObject({ maxOpenLevel: 4, frontier: { level: 4, at: 4000 } });
    await persistUnlockState(storage, history, options);
    expect(saved(storage).maxOpenLevel).toBe(4);
    for (let i = 1; i <= 10; i++) {
      const before = saved(storage);
      history.push(...wins(49 + i, 1, 45));
      expect(result(history, before)).toMatchObject({
        hintFreeSolvesAtLevel: i,
        justUnlockedLevel: i === 10 ? 5 : null,
      });
      await persistUnlockState(storage, history, options);
    }
    expect(saved(storage).maxOpenLevel).toBe(5);
  });

  it("cannot persist a raise when no valid opening clock/boundary can be obtained", async () => {
    for (const now of [
      () => NaN,
      () => 0,
      () => {
        throw Error("clock blocked");
      },
    ]) {
      const storage = memoryStorage();
      await persistUnlockState(storage, [], options);
      const before = storage.getItem(UNLOCK_KEY),
        write = vi.spyOn(storage, "setItem");
      expect((await persistUnlockState(storage, [], { ...options, openLevel: 5, now })).ok).toBe(
        false
      );
      expect(write).not.toHaveBeenCalled();
      expect(storage.getItem(UNLOCK_KEY)).toBe(before);
    }
  });

  it("samples the clock under the shared lock and retains the first boundary per level", async () => {
    const storage = memoryStorage(),
      locks = sharedLocks();
    const now = vi.fn(() => {
      expect(locks.held).toBe(true);
      return 100;
    });
    await persistUnlockState(storage, [], { ...options, locks, openLevel: 5, now });
    const first = structuredClone(saved(storage).openings);
    await persistUnlockState(storage, [], { ...options, locks, openLevel: 5, now: () => 999 });
    await persistUnlockState(storage, [], { ...options, locks, openLevel: 6, now: () => 50 });
    expect(saved(storage).openings[4]).toEqual(first[4]);
    expect(saved(storage).openings[5]).toEqual(first[5]);
    expect(saved(storage).openings[6]).toEqual({ level: 6, at: 100 });
    expect(now).toHaveBeenCalledTimes(1);
  });
});

describe("canonical legacy migration", () => {
  it("has identical counts and boundaries for both stale/fresh tab orders", async () => {
    const original = [...wins(1, 10, 32), ...wins(20, 5, 45)];
    const stale = [...original, ...wins(40, 4, 56)],
      fresh = [...stale, ...wins(50, 1, 13)];
    const outputs = [];
    for (const order of [
      [stale, fresh],
      [fresh, stale],
    ]) {
      const storage = memoryStorage(),
        locks = sharedLocks();
      storage.setItem(
        UNLOCK_KEY,
        JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 })
      );
      storeCompletedAttempts(storage, fresh);
      const recordBytes = storage.getItem("sudoku-bank-records-v1");
      await Promise.all(
        order.map((history) => persistUnlockState(storage, history, { ...options, locks }))
      );
      const migrated = structuredClone(saved(storage).frontier),
        history = [...fresh],
        counts = [];
      for (let n = 60; n < 70; n++) {
        const before = saved(storage);
        history.push(...wins(n, 1, 56));
        counts.push(result(history, before).hintFreeSolvesAtLevel);
        await persistUnlockState(storage, history, { ...options, locks });
      }
      outputs.push({ migrated, counts, final: saved(storage).maxOpenLevel });
      expect(storage.getItem("sudoku-bank-records-v1")).toBe(recordBytes);
    }
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]).toMatchObject({
      migrated: { after: { endedAt: 5001, attemptId: "attempt-50" } },
      counts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      final: 6,
    });
  });

  it("fails closed when the authoritative log is absent or unreadable", async () => {
    for (const raw of [null, "{broken", '{"schema":99}']) {
      const storage = memoryStorage();
      const old = JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 });
      storage.setItem(UNLOCK_KEY, old);
      if (raw !== null) storage.setItem("sudoku-bank-records-v1", raw);
      expect((await persistUnlockState(storage, wins(1, 10, 56), options)).ok).toBe(false);
      expect(storage.getItem(UNLOCK_KEY)).toBe(old);
    }
  });
});

it("can date an explicit higher opening even when the previous legacy opening is undated", async () => {
  const storage = memoryStorage();
  storage.setItem(UNLOCK_KEY, JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 }));
  expect(
    await persistUnlockState(storage, [], { ...options, openLevel: 6, now: () => 100 })
  ).toMatchObject({ ok: true, state: { maxOpenLevel: 6, frontier: { level: 6, at: 100 } } });
});

it("rejects malformed, conflicting, and backwards per-level boundaries without overwriting", async () => {
  const cases = [
    {
      4: { level: 4, after: { endedAt: 100, attemptId: "z" } },
      5: { level: 5, after: { endedAt: 100, attemptId: "a" } },
    },
    { 4: { level: 4, at: 100 }, 5: { level: 5, after: { endedAt: 100, attemptId: "z" } } },
    { 4: { level: 4, at: 200 }, 5: { level: 5, at: 100 } },
    { 4: { level: 5, at: 100 } },
    { 9: { level: 9, at: 100 } },
  ];
  for (const openings of cases) {
    const storage = memoryStorage(),
      raw = JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5, openings });
    storage.setItem(UNLOCK_KEY, raw);
    expect(readUnlockState(storage, "player").status).toBe("unreadable");
    expect((await persistUnlockState(storage, [], { ...options, openLevel: 6 })).ok).toBe(false);
    expect(storage.getItem(UNLOCK_KEY)).toBe(raw);
  }
});

it("respects every recorded level boundary when a policy would otherwise open it earlier", async () => {
  const storage = memoryStorage(),
    history = [...wins(1, 10, 32), ...wins(20, 10, 45)];
  await persistUnlockState(storage, history, { ...options, openLevel: 5, now: () => 4000 });
  const state = saved(storage);
  const { projectPlayerUnlock } = await import("./player-unlock.js");
  const projected = projectPlayerUnlock(history, state, { unlockRequiredHintFreeSolves: 5 });
  expect(projected.maxOpenLevel).toBe(5);
  expect(projected.perLevel[4].hintFreeSolves).toBe(0);
  expect(projected.perLevel[5].hintFreeSolves).toBe(0);
});

it("migrates a canonical empty bank log at origin and counts all future completions", async () => {
  const storage = memoryStorage(),
    history = [];
  storage.setItem(UNLOCK_KEY, JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 }));
  storeCompletedAttempts(storage, history);
  await persistUnlockState(storage, history, options);
  expect(saved(storage).frontier).toEqual({ level: 5, at: 0 });
  for (let n = 1; n <= 10; n++) {
    const before = saved(storage);
    history.push(...wins(n, 1, 56));
    expect(result(history, before)).toMatchObject({
      hintFreeSolvesAtLevel: n,
      justUnlockedLevel: n === 10 ? 6 : null,
    });
    await persistUnlockState(storage, history, options);
  }
  expect(saved(storage).maxOpenLevel).toBe(6);
});

it("projects the whole canonical migration history even when the first tab omits an unlock", async () => {
  const base = [...wins(1, 10, 32), ...wins(20, 5, 45)];
  const stale = [...base, ...wins(40, 4, 56)],
    fresh = [...base, ...wins(40, 10, 56)];
  const outputs = [];
  for (const order of [
    [stale, fresh],
    [fresh, stale],
  ]) {
    const storage = memoryStorage(),
      locks = sharedLocks();
    storage.setItem(UNLOCK_KEY, JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 }));
    storeCompletedAttempts(storage, fresh);
    await Promise.all(
      order.map((history) => persistUnlockState(storage, history, { ...options, locks }))
    );
    const migrated = structuredClone(saved(storage)),
      history = [...fresh],
      counts = [];
    for (let n = 60; n < 70; n++) {
      const before = saved(storage);
      history.push(...wins(n, 1, 65));
      counts.push(result(history, before).hintFreeSolvesAtLevel);
      await persistUnlockState(storage, history, options);
    }
    outputs.push({ migrated, counts, final: saved(storage).maxOpenLevel });
  }
  expect(outputs[0]).toEqual(outputs[1]);
  expect(outputs[0]).toMatchObject({
    migrated: { maxOpenLevel: 6 },
    counts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    final: 7,
  });
});

it("rejects mixed-player canonical inference", async () => {
  const { inferUnlockFrontier } = await import("./player-unlock.js");
  expect(() => inferUnlockFrontier([attempt(1), attempt(2, { playerId: "other" })], 5)).toThrow(
    /one player/
  );
});

it("validates the highest boundary against lower levels and derives a missing alias without writing", () => {
  const storage = memoryStorage();
  const invalid = JSON.stringify({
    schema: 1,
    playerId: "player",
    maxOpenLevel: 5,
    frontier: { level: 5, at: 100 },
    openings: { 4: { level: 4, at: 200 } },
  });
  storage.setItem(UNLOCK_KEY, invalid);
  expect(readUnlockState(storage, "player").status).toBe("unreadable");
  expect(storage.getItem(UNLOCK_KEY)).toBe(invalid);
  const valid = JSON.stringify({
    schema: 1,
    playerId: "player",
    maxOpenLevel: 5,
    openings: { 4: { level: 4, at: 100 }, 5: { level: 5, at: 200 } },
  });
  storage.setItem(UNLOCK_KEY, valid);
  expect(saved(storage).frontier).toEqual({ level: 5, at: 200 });
  expect(storage.getItem(UNLOCK_KEY)).toBe(valid);
});
