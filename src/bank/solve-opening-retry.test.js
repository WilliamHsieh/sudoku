import { describe, expect, it, vi } from "vitest";
import { attempt, memoryStorage, puzzle } from "./test-fixtures.js";
import { storeCompletedAttempts } from "./unlock-test-fixtures.js";
import { deriveUnlockState } from "./unlock.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { solveResult } from "./player-api.js";
import { persistUnlockState, readUnlockState, UNLOCK_KEY } from "./unlock-storage.js";

const options = { playerId: "player", locks: null };
const wins = (first, count, rating) =>
  Array.from({ length: count }, (_, i) =>
    attempt(first + i, { puzzle: puzzle(first + i, rating) })
  );
const first = () => wins(1, 10, 32);
const full = () => [...first(), ...wins(20, 10, 45)];
function saved(storage) {
  const read = readUnlockState(storage, "player");
  if (read.status !== "ok") throw Error("Dated saved state required");
  return read.state;
}
function checkFive(state) {
  expect(state).toMatchObject({
    maxOpenLevel: 5,
    frontier: { level: 5, after: { endedAt: 2901, attemptId: "attempt-29" } },
    openings: {
      4: { level: 4, after: { endedAt: 1001, attemptId: "attempt-10" } },
      5: { level: 5, after: { endedAt: 2901, attemptId: "attempt-29" } },
    },
  });
}

describe("solve openings survive checkpoint failures and delays", () => {
  it("reproduces ten L3 solves, failed write, ten L4 solves, and retry to L5", async () => {
    const storage = memoryStorage();
    await persistUnlockState(storage, [], options);
    const original = storage.getItem(UNLOCK_KEY),
      write = storage.setItem;
    storeCompletedAttempts(storage, first());
    storage.setItem = (key, value) => {
      if (key === UNLOCK_KEY) throw Error("temporarily blocked");
      write(key, value);
    };
    expect((await persistUnlockState(storage, first(), { ...options, now: () => 1100 })).ok).toBe(
      false
    );
    expect(storage.getItem(UNLOCK_KEY)).toBe(original);
    storeCompletedAttempts(storage, full());
    storage.setItem = write;
    const before = saved(storage),
      history = full();
    expect(deriveUnlockState(history).maxOpenLevel).toBe(5);
    expect(
      solveResult(history, history.at(-1).attemptId, {
        previousMaxOpenLevel: before.maxOpenLevel,
        frontier: before.frontier,
      })
    ).toMatchObject({ justUnlockedLevel: 5, hintFreeSolvesAtLevel: 10 });
    const now = vi.fn(() => {
      throw Error("A solve opening must not use the clock");
    });
    const retried = await persistUnlockState(storage, history, { ...options, now });
    expect(retried.ok).toBe(true);
    checkFive(saved(storage));
    expect(now).not.toHaveBeenCalled();
  });

  it.each(["delayed", "no initialization", "empty dated opening"])(
    "uses completion boundaries after %s",
    async (variant) => {
      const storage = memoryStorage(),
        history = variant === "empty dated opening" ? wins(10, 10, 56) : full();
      if (variant === "delayed") await persistUnlockState(storage, [], options);
      if (variant === "empty dated opening")
        await persistUnlockState(storage, [], { ...options, openLevel: 5, now: () => 1 });
      const now = vi.fn(() => {
        throw Error("Unexpected clock");
      });
      storeCompletedAttempts(storage, history);
      expect((await persistUnlockState(storage, history, { ...options, now })).ok).toBe(true);
      if (variant === "empty dated opening") {
        expect(saved(storage)).toMatchObject({
          maxOpenLevel: 6,
          frontier: { level: 6, after: { endedAt: 1901, attemptId: "attempt-19" } },
        });
      } else checkFive(saved(storage));
      expect(now).not.toHaveBeenCalled();
    }
  );

  it("retains a delivered opening when verification failed, then records the next solve opening", async () => {
    const storage = memoryStorage();
    await persistUnlockState(storage, [], options);
    storeCompletedAttempts(storage, first());
    const read = storage.getItem,
      write = storage.setItem;
    let fail = false;
    storage.setItem = (key, value) => {
      write(key, value);
      if (key === UNLOCK_KEY) fail = true;
    };
    storage.getItem = (key) => {
      if (key === UNLOCK_KEY && fail) {
        fail = false;
        throw Error("verification blocked");
      }
      return read(key);
    };
    expect((await persistUnlockState(storage, first(), options)).ok).toBe(false);
    storage.getItem = read;
    storage.setItem = write;
    const original = structuredClone(saved(storage).openings[4]);
    storeCompletedAttempts(storage, full());
    expect(
      (
        await persistUnlockState(storage, full(), {
          ...options,
          now: () => {
            throw Error("Unexpected clock");
          },
        })
      ).ok
    ).toBe(true);
    checkFive(saved(storage));
    expect(saved(storage).openings[4]).toEqual(original);
  });
});

describe("option C ignores undated stored high-water marks", () => {
  it.each(["bare", "lower boundary only"])(
    "ignores %s without granting L5 credit or L6",
    async (shape) => {
      const storage = memoryStorage(),
        history = [...wins(1, 1, 13), ...wins(10, 10, 56)];
      const undated = {
        schema: 1,
        playerId: "player",
        maxOpenLevel: 5,
        ...(shape === "lower boundary only" ? { openings: { 4: { level: 4, at: 1 } } } : {}),
      };
      const raw = JSON.stringify(undated);
      storage.setItem(UNLOCK_KEY, raw);
      storeCompletedAttempts(storage, history);
      expect(readUnlockState(storage, "player")).toEqual({ status: "ignored", state: null });
      expect(storage.getItem(UNLOCK_KEY)).toBe(raw);
      const projected = projectPlayerUnlock(history, undated);
      expect(projected.maxOpenLevel).toBe(deriveUnlockState(history).maxOpenLevel);
      expect(projected.perLevel[5].hintFreeSolves).toBe(0);
      expect(
        solveResult(history, history.at(-1).attemptId, { previousMaxOpenLevel: 5 })
      ).toMatchObject({
        countsTowardUnlock: false,
        hintFreeSolvesAtLevel: 0,
        justUnlockedLevel: null,
      });
      expect(
        (
          await persistUnlockState(storage, history, {
            ...options,
            now: () => {
              throw Error("No non-solve opening");
            },
          })
        ).ok
      ).toBe(true);
      expect(saved(storage).maxOpenLevel).toBe(3);
      expect(saved(storage).openings[5]).toBeUndefined();
    }
  );

  it("re-derives earned levels without retaining an undated higher maximum", async () => {
    const storage = memoryStorage(),
      history = full();
    storage.setItem(UNLOCK_KEY, JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 8 }));
    expect(
      solveResult(history, history.at(-1).attemptId, { previousMaxOpenLevel: 8 }).justUnlockedLevel
    ).toBe(5);
    storeCompletedAttempts(storage, history);
    expect((await persistUnlockState(storage, history, options)).ok).toBe(true);
    checkFive(saved(storage));
    expect(saved(storage).openings[8]).toBeUndefined();
  });
});

it("does not mistake unknown policy fields for a policy change or discard them", async () => {
  const storage = memoryStorage();
  await persistUnlockState(storage, [], options);
  const state = JSON.parse(storage.getItem(UNLOCK_KEY));
  state.policy.note = "preserve";
  storage.setItem(UNLOCK_KEY, JSON.stringify(state));
  storeCompletedAttempts(storage, full());
  expect(
    (
      await persistUnlockState(storage, full(), {
        ...options,
        now: () => {
          throw Error("Unexpected clock");
        },
      })
    ).ok
  ).toBe(true);
  checkFive(saved(storage));
  expect(saved(storage)).toMatchObject({ policy: { note: "preserve" } });
});

it("keeps solve-earned completion dates when an initial policy is restored after a batch", async () => {
  const storage = memoryStorage();
  await persistUnlockState(storage, [], {
    ...options,
    policy: { unlockInitialLevels: 5 },
    now: () => 1,
  });
  const history = wins(10, 10, 56);
  const now = vi.fn(() => {
    throw Error("These levels were earned by solves");
  });
  storeCompletedAttempts(storage, history);
  expect((await persistUnlockState(storage, history, { ...options, now })).ok).toBe(true);
  expect(saved(storage)).toMatchObject({
    maxOpenLevel: 6,
    frontier: { level: 6, after: { endedAt: 1901, attemptId: "attempt-19" } },
  });
  expect(now).not.toHaveBeenCalled();
});

it("does not re-date solve-earned levels when an explicit request repeats the earned level", async () => {
  const storage = memoryStorage();
  await persistUnlockState(storage, [], options);
  const now = vi.fn(() => {
    throw Error("No non-solve opening is needed");
  });
  storeCompletedAttempts(storage, full());
  expect((await persistUnlockState(storage, full(), { ...options, openLevel: 5, now })).ok).toBe(
    true
  );
  checkFive(saved(storage));
  expect(now).not.toHaveBeenCalled();
});

it("derives the same dated result from ignored values in either stale/fresh write order", async () => {
  const stale = [...wins(1, 10, 32), ...wins(20, 5, 45), ...wins(40, 4, 56)];
  const fresh = [...stale, ...wins(50, 1, 13), ...wins(60, 5, 45)];
  const outputs = [];
  for (const order of [
    [stale, fresh],
    [fresh, stale],
  ]) {
    const storage = memoryStorage();
    storage.setItem(UNLOCK_KEY, JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 8 }));
    storeCompletedAttempts(storage, fresh);
    await Promise.all(
      order.map((history) =>
        persistUnlockState(storage, history, {
          ...options,
          now: () => {
            throw Error("Only solve-derived boundaries are needed");
          },
        })
      )
    );
    outputs.push(saved(storage));
    expect(projectPlayerUnlock(fresh, saved(storage)).perLevel[5].hintFreeSolves).toBe(0);
  }
  expect(outputs[0]).toEqual(outputs[1]);
  expect(outputs[0]).toMatchObject({
    maxOpenLevel: 5,
    frontier: { level: 5, after: { endedAt: 6401, attemptId: "attempt-64" } },
  });
});
