import { describe, expect, it, vi } from "vitest";
import { attempt, memoryStorage, puzzle } from "./test-fixtures.js";
import { deriveUnlockState } from "./unlock.js";
import { solveResult } from "./player-api.js";
import { persistUnlockState, readUnlockState, UNLOCK_KEY } from "./unlock-storage.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { BANK_LOCK } from "./write-lock.js";

const options = { playerId: "player", locks: null };
const wins = (count, rating, offset) =>
  Array.from({ length: count }, (_, i) =>
    attempt(offset + i, { puzzle: puzzle(offset + i, rating) })
  );
const original = () => [...wins(10, 32, 1), ...wins(5, 45, 11)];
function saved(storage) {
  const read = readUnlockState(storage, "player");
  if (read.status !== "ok") throw Error("Expected saved unlock state");
  return read.state;
}
async function earnedFive(storage, history) {
  expect(
    await persistUnlockState(storage, history, {
      ...options,
      policy: { unlockRequiredHintFreeSolves: 5 },
    })
  ).toMatchObject({ ok: true, state: { maxOpenLevel: 5 } });
  expect(deriveUnlockState(history).maxOpenLevel).toBe(4);
  expect(await persistUnlockState(storage, history, options)).toMatchObject({
    ok: true,
    state: { maxOpenLevel: 5 },
  });
}

describe("effective stored frontier", () => {
  it("reproduces the verifier history: ten L5 solves show 1..10 and persist L6", async () => {
    const storage = memoryStorage(),
      history = original();
    await earnedFive(storage, history);
    for (let i = 1; i <= 10; i++) {
      const before = saved(storage),
        next = wins(1, 56, 20 + i)[0];
      history.push(next);
      // A dated stored frontier supplies the effective opening time.
      const result = solveResult(history, next.attemptId, {
        previousMaxOpenLevel: before.maxOpenLevel,
        frontier: before.frontier,
      });
      expect(result).toMatchObject({
        countsTowardUnlock: true,
        hintFreeSolvesAtLevel: i,
        required: 10,
        justUnlockedLevel: i === 10 ? 6 : null,
      });
      expect(await persistUnlockState(storage, history, options)).toMatchObject({
        ok: true,
        state: { maxOpenLevel: i === 10 ? 6 : 5 },
      });
    }
    expect(saved(storage)).toMatchObject({
      maxOpenLevel: 6,
      frontier: { level: 6, after: { endedAt: 3001, attemptId: "attempt-30" } },
    });
  });

  it("excludes earlier L5 solves made before the stored level opened", async () => {
    const storage = memoryStorage();
    const early = wins(10, 56, 1);
    const history = [...early, ...wins(10, 32, 20), ...wins(5, 45, 40)];
    await earnedFive(storage, history);
    const opening = saved(storage).frontier;
    expect(opening.after.endedAt).toBe(4401);
    for (let i = 1; i <= 10; i++) {
      const before = saved(storage),
        next = wins(1, 56, 50 + i)[0];
      history.push(next);
      expect(
        solveResult(history, next.attemptId, {
          previousMaxOpenLevel: before.maxOpenLevel,
          frontier: before.frontier,
        })
      ).toMatchObject({
        countsTowardUnlock: true,
        hintFreeSolvesAtLevel: i,
        justUnlockedLevel: i === 10 ? 6 : null,
      });
      await persistUnlockState(storage, history, options);
      expect(saved(storage).maxOpenLevel).toBe(i === 10 ? 6 : 5);
    }
  });

  it("keeps earned credit when later lower-level play follows the opening", async () => {
    const storage = memoryStorage(),
      history = original();
    await earnedFive(storage, history);
    history.push(...wins(4, 56, 21));
    await persistUnlockState(storage, history, options);
    const opening = saved(storage).frontier;
    history.push(...wins(3, 10, 30));
    await persistUnlockState(storage, history, options);
    expect(saved(storage).frontier).toEqual(opening);
    for (let i = 5; i <= 10; i++) {
      const before = saved(storage),
        next = wins(1, 56, 40 + i)[0];
      history.push(next);
      expect(
        solveResult(history, next.attemptId, {
          previousMaxOpenLevel: before.maxOpenLevel,
          frontier: before.frontier,
        })
      ).toMatchObject({ hintFreeSolvesAtLevel: i, justUnlockedLevel: i === 10 ? 6 : null });
      await persistUnlockState(storage, history, options);
    }
    expect(saved(storage).maxOpenLevel).toBe(6);
  });

  it("starts L6 at zero and does not recycle pre-open L6 completions", async () => {
    const storage = memoryStorage(),
      history = original();
    await earnedFive(storage, history);
    history.push(...wins(10, 65, 20), ...wins(10, 56, 40));
    await persistUnlockState(storage, history, options);
    expect(saved(storage).maxOpenLevel).toBe(6);
    const before = saved(storage),
      next = wins(1, 65, 60)[0];
    history.push(next);
    expect(
      solveResult(history, next.attemptId, { previousMaxOpenLevel: 6, frontier: before.frontier })
    ).toMatchObject({ hintFreeSolvesAtLevel: 1, justUnlockedLevel: null });
    await persistUnlockState(storage, history, options);
    expect(saved(storage).maxOpenLevel).toBe(6);
  });

  it("keeps first-attempt reservation, replay, hint, and reveal exclusions", async () => {
    const storage = memoryStorage(),
      history = original();
    await earnedFive(storage, history);
    history.push(...wins(9, 56, 21));
    const unfinished = attempt(30, { puzzle: puzzle(30, 56) }, "pause");
    const later = attempt(31, { puzzle: unfinished.puzzle });
    history.push(
      unfinished,
      later,
      attempt(32, { puzzle: puzzle(32, 56), replay: true }),
      attempt(33, { puzzle: puzzle(33, 56) }, "hint"),
      attempt(34, { puzzle: puzzle(34, 56) }, "reveal")
    );
    await persistUnlockState(storage, history, options);
    expect(saved(storage).maxOpenLevel).toBe(5);
    const before = saved(storage),
      next = wins(1, 56, 35)[0];
    history.push(next);
    expect(
      solveResult(history, next.attemptId, { previousMaxOpenLevel: 5, frontier: before.frontier })
    ).toMatchObject({ hintFreeSolvesAtLevel: 10, justUnlockedLevel: 6 });
  });

  it("uses completion order and code-unit ties at the stored opening", () => {
    const early = { ...wins(1, 56, 20)[0], attemptId: "a", endedAt: 5000 };
    const late = { ...wins(1, 56, 21)[0], attemptId: "c", endedAt: 5000 };
    const result = projectPlayerUnlock([...original(), late, early], {
      maxOpenLevel: 5,
      frontier: { level: 5, after: { endedAt: 5000, attemptId: "b" } },
    });
    expect(result.credited.has("a")).toBe(false);
    expect(result.credited.has("c")).toBe(true);
    expect(result.perLevel[5].hintFreeSolves).toBe(1);
  });

  it("fails closed on malformed opening metadata and preserves stored bytes", async () => {
    for (const frontier of [
      null,
      {},
      { level: 4, after: { endedAt: 100, attemptId: "a" } },
      { level: 5, after: { endedAt: 0, attemptId: "a" } },
      { level: 5, after: { endedAt: 100, attemptId: "" } },
    ]) {
      const storage = memoryStorage();
      const raw = JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5, frontier });
      storage.setItem(UNLOCK_KEY, raw);
      expect(readUnlockState(storage, "player").status).toBe("unreadable");
      expect(await persistUnlockState(storage, original(), options)).toMatchObject({
        ok: false,
        code: "unreadable_storage",
      });
      expect(storage.getItem(UNLOCK_KEY)).toBe(raw);
    }
  });

  it("serializes stale tabs and retries a delivered frontier advance without losing the boundary", async () => {
    const storage = memoryStorage(),
      history = original();
    await earnedFive(storage, history);
    const stale = structuredClone(history);
    history.push(...wins(10, 56, 21));
    let tail = Promise.resolve();
    const locks = {
      request: vi.fn((name, work) => {
        expect(name).toBe(BANK_LOCK);
        const result = tail.then(work);
        tail = result.catch(() => {});
        return result;
      }),
    };
    const read = storage.getItem,
      write = storage.setItem;
    let fail = true;
    storage.setItem = (key, value) => {
      write(key, value);
    };
    storage.getItem = (key) => {
      const value = read(key);
      if (fail && value?.includes('"maxOpenLevel":6')) {
        fail = false;
        throw Error("verification read");
      }
      return value;
    };
    expect((await persistUnlockState(storage, history, { ...options, locks })).ok).toBe(false);
    storage.getItem = read;
    const frontier = saved(storage).frontier;
    await Promise.all([
      persistUnlockState(storage, stale, { ...options, locks }),
      persistUnlockState(storage, history, { ...options, locks }),
    ]);
    expect(saved(storage)).toMatchObject({ maxOpenLevel: 6, frontier });
  });
});

it("merges newer derived access with a stale numeric maximum", () => {
  const history = [...wins(1, 10, 1), ...wins(10, 32, 10), ...wins(1, 45, 30)];
  expect(solveResult(history, history.at(-1).attemptId, { previousMaxOpenLevel: 3 })).toMatchObject(
    { countsTowardUnlock: true, hintFreeSolvesAtLevel: 1 }
  );
});

it("keeps valid storage when a policy raises the initial open level above its old boundary", async () => {
  const storage = memoryStorage();
  await earnedFive(storage, original());
  expect(
    await persistUnlockState(storage, original(), {
      ...options,
      policy: { unlockInitialLevels: 6 },
    })
  ).toMatchObject({ ok: true, state: { maxOpenLevel: 6 } });
  expect(readUnlockState(storage, "player").status).toBe("ok");
});

it("does not retroactively credit a known locked period after a more permissive policy", () => {
  const l3 = wins(10, 32, 1),
    l4 = wins(5, 45, 20);
  const locked = wins(10, 56, 30),
    opening = wins(5, 45, 40);
  const boundary = opening.at(-1);
  const newer = wins(1, 56, 60)[0];
  const state = projectPlayerUnlock(
    [...l3, ...l4, ...locked, ...opening, newer],
    {
      maxOpenLevel: 5,
      frontier: { level: 5, after: { endedAt: boundary.endedAt, attemptId: boundary.attemptId } },
    },
    { unlockRequiredHintFreeSolves: 5 }
  );
  expect(state.maxOpenLevel).toBe(5);
  expect(state.perLevel[5].hintFreeSolves).toBe(1);
  expect(locked.every((a) => !state.credited.has(a.attemptId))).toBe(true);
});
