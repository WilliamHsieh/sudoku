import { expect, it, vi } from "vitest";
import { attempt, puzzle, memoryStorage } from "./test-fixtures.js";
import { persistUnlockState, readUnlockState, UNLOCK_KEY } from "./unlock-storage.js";
import { projectRecords, RECORDS_KEY } from "./records.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { BANK_LOCK } from "./write-lock.js";

const options = { playerId: "player", locks: null, now: () => 99999 };
const wins = (first, count, rating) =>
  Array.from({ length: count }, (_, i) =>
    attempt(first + i, { puzzle: puzzle(first + i, rating) })
  );
/** @param {import('./types.js').Attempt} a @returns {import('./types.js').PlayEvent} */
const start = (a) => ({
  id: "start",
  attemptId: a.attemptId,
  at: a.startedAt,
  type: "start",
  start: a,
});
/** @param {import('./types.js').Attempt} a @returns {import('./types.js').PlayEvent} */
const complete = (a) => ({
  id: "complete",
  attemptId: a.attemptId,
  at: a.endedAt,
  type: "complete",
});
function histories() {
  const early = attempt(1, { puzzle: puzzle(1, 32) });
  const prefix = [start(early), ...wins(2, 10, 32).flatMap((a) => [start(a), complete(a)])];
  const later = wins(20, 10, 45).map((a, i) => ({
    ...a,
    startedAt: 1020 + i * 20,
    endedAt: 1030 + i * 20,
    updatedAt: 1030 + i * 20,
  }));
  /** @type {import('./types.js').RecordLog} */
  const log = {
    schema: 1,
    events: [...prefix, complete(early), ...later.flatMap((a) => [start(a), complete(a)])],
  };
  return { log, stale: projectRecords({ schema: 1, events: prefix }), fresh: projectRecords(log) };
}

it.each(["missing", "empty-init", "undated"])(
  "%s: both tab save orders retain the canonical boundaries and all ten L4 credits",
  async (initial) => {
    const { log, stale, fresh } = histories();
    const outputs = [];
    for (const order of [
      [stale, fresh],
      [fresh, stale],
    ]) {
      const storage = memoryStorage();
      if (initial === "empty-init")
        expect((await persistUnlockState(storage, [], options)).ok).toBe(true);
      if (initial === "undated")
        storage.setItem(
          UNLOCK_KEY,
          JSON.stringify({ schema: 1, playerId: "player", maxOpenLevel: 5 })
        );
      // Simulate the canonical log arriving while the callers wait for the lock.
      let tail = Promise.resolve();
      const locks = {
        request(name, work) {
          expect(name).toBe(BANK_LOCK);
          const result = tail.then(work);
          tail = result.catch(() => {});
          return result;
        },
      };
      const writes = order.map((snapshot) =>
        persistUnlockState(storage, snapshot, { ...options, locks })
      );
      storage.setItem(RECORDS_KEY, JSON.stringify(log));
      expect((await Promise.all(writes)).every((r) => r.ok)).toBe(true);
      const read = readUnlockState(storage, "player");
      if (read.status !== "ok") throw Error("Saved state required");
      expect(read.state).toMatchObject({
        maxOpenLevel: 5,
        openings: {
          4: { level: 4, after: { endedAt: 1001, attemptId: "attempt-10" } },
          5: { level: 5, after: { endedAt: 1210, attemptId: "attempt-29" } },
        },
      });
      expect(projectPlayerUnlock(fresh, read.state).perLevel[4].hintFreeSolves).toBe(10);
      expect((await persistUnlockState(storage, fresh, { ...options, locks })).ok).toBe(true);
      expect(readUnlockState(storage, "player")).toEqual(read);
      outputs.push(read.state);
    }
    expect(outputs[0]).toEqual(outputs[1]);
  }
);

it("uses only the requested player's canonical log, even with an empty caller snapshot", async () => {
  const storage = memoryStorage();
  const { log } = histories();
  const foreign = attempt(40, { playerId: "other", puzzle: puzzle(40, 56) });
  storage.setItem(
    RECORDS_KEY,
    JSON.stringify({ ...log, events: [...log.events, start(foreign), complete(foreign)] })
  );
  expect(await persistUnlockState(storage, [], options)).toMatchObject({
    ok: true,
    state: { maxOpenLevel: 5 },
  });
});

it("does not earn solve openings from attempts absent from storage", async () => {
  const storage = memoryStorage();
  expect(await persistUnlockState(storage, histories().fresh, options)).toMatchObject({
    ok: true,
    state: { maxOpenLevel: 3 },
  });
});

it.each(["corrupt", "blocked"])(
  "fails closed on %s records even for solve-only writes",
  async (failure) => {
    const storage = memoryStorage();
    await persistUnlockState(storage, [], options);
    const before = storage.getItem(UNLOCK_KEY);
    if (failure === "corrupt") storage.setItem(RECORDS_KEY, '{"schema":99}');
    const read = storage.getItem;
    storage.getItem = (key) => {
      if (key === RECORDS_KEY && failure === "blocked") throw Error("blocked");
      return read(key);
    };
    const write = vi.spyOn(storage, "setItem");
    expect((await persistUnlockState(storage, histories().fresh, options)).ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(UNLOCK_KEY)).toBe(before);
  }
);
