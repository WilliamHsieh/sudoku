import { describe, expect, it, vi } from "vitest";
import { createRecorder, BANK_LOCK, BANK_GAME_KEY, BANK_SAVES_KEY } from "./recorder.js";
import { persistUnlockState, readUnlockState, UNLOCK_KEY } from "./unlock-storage.js";
import { projectRecords, RECORDS_KEY, readRecords } from "./records.js";
import { attempt, catalogWith, memoryStorage, puzzle, start } from "./test-fixtures.js";
import { buildBankGameMeta } from "./game-meta.js";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { storeAttempts, storeCompletedAttempts } from "./unlock-test-fixtures.js";

function locks() {
  let tail = Promise.resolve();
  return {
    request: vi.fn((name, work) => {
      expect(name).toBe(BANK_LOCK);
      const next = tail.then(work);
      tail = next.catch(() => {});
      return next;
    }),
  };
}
function storedLog(storage) {
  const read = readRecords(storage);
  if (read.status === "unreadable") throw Error(read.detail);
  return read.log;
}
/** @param {ReturnType<typeof memoryStorage>} storage
 * @param {"complete"|"hint"|"pause"|"resume"|"reveal"|"give_up"} [outcome]
 * @param {import("./types.js").Feedback} [feedback] */
function seed(storage, outcome = "complete", feedback) {
  const data = start(1);
  /** @type {import("./types.js").PlayEvent[]} */
  const events = [
    { id: "start", attemptId: data.attemptId, at: 100, type: "start", start: data },
    { id: "outcome", attemptId: data.attemptId, at: 101, type: outcome },
  ];
  if (outcome === "hint")
    events.push({ id: "complete", attemptId: data.attemptId, at: 102, type: "complete" });
  if (feedback !== undefined)
    events.push({
      id: "old-feedback",
      attemptId: data.attemptId,
      at: 103,
      type: "feedback",
      feedback,
    });
  storage.setItem(RECORDS_KEY, JSON.stringify({ schema: 1, events }));
  return { attemptId: data.attemptId, playerId: data.playerId };
}
const recorder = (storage, options = {}) =>
  createRecorder({ storage, locks: null, onError: vi.fn(), now: () => 1, ...options });
const wins = (count = 10) =>
  Array.from({ length: count }, (_, i) => attempt(i + 1, { puzzle: puzzle(i + 1, 32) }));

function failVerification(storage, key) {
  const read = storage.getItem,
    write = storage.setItem;
  let fail = false;
  storage.setItem = (k, value) => {
    write(k, value);
    if (k === key) fail = true;
  };
  storage.getItem = (k) => {
    if (fail && k === key) {
      fail = false;
      throw Error("verification read blocked");
    }
    return read(k);
  };
  return () => {
    storage.getItem = read;
    storage.setItem = write;
  };
}

describe("feedback write policy and retries", () => {
  it("sets, changes and clears feedback by identity without opening a game", async () => {
    const storage = memoryStorage(),
      identity = seed(storage),
      r = recorder(storage);
    const before = structuredClone(projectRecords(storedLog(storage))[0]);
    for (const feedback of /** @type {const} */ (["light", "some_effort", "struggle", undefined])) {
      expect(await r.setFeedback(feedback, identity)).toMatchObject({ ok: true });
      const current = projectRecords(storedLog(storage))[0];
      expect(current.feedback).toBe(feedback);
      expect(current.endedAt).toBe(before.endedAt);
      expect(current.effectiveMs).toBe(before.effectiveMs);
    }
    const events = storedLog(storage).events.filter((e) => e.type === "feedback");
    expect(events).toHaveLength(4);
    expect(new Set(events.map((e) => e.id)).size).toBe(4);
    expect(storage.data.has(BANK_GAME_KEY)).toBe(false);
  });
  it("writes feedback for the current finished game after its queued completion", async () => {
    const storage = memoryStorage(),
      r = recorder(storage);
    const { catalog } = await openCatalog(catalogWith([10]));
    const meta = buildBankGameMeta(
      selectPuzzle({ catalog, playerId: "player", mode: "manual", level: 1, seed: "feedback" }),
      { playerId: "player", attemptId: "current", source: catalog.source }
    );
    await r.open(meta);
    r.begin();
    r.lifecycle("pause", 2);
    r.lifecycle("resume", 2);
    r.complete(3);
    expect(await r.setFeedback("light")).toMatchObject({ ok: true });
    expect(projectRecords(storedLog(storage))[0]).toMatchObject({
      feedback: "light",
      effectiveMs: 3000,
    });
    expect(await r.clearFeedback()).toMatchObject({ ok: true });
    expect(projectRecords(storedLog(storage))[0]).not.toHaveProperty("feedback");
  });
  it.each([
    ["pause", "attempt_not_finished"],
    ["resume", "attempt_not_finished"],
    ["hint", "hint_used"],
    ["reveal", "answer_revealed"],
  ])(
    "rejects %s feedback without changing the log or poisoning the queue",
    async (outcome, code) => {
      const storage = memoryStorage(),
        identity = seed(storage, /** @type {Parameters<typeof seed>[1]} */ (outcome)),
        r = recorder(storage);
      const before = storage.getItem(RECORDS_KEY);
      expect(await r.setFeedback("light", identity)).toMatchObject({ ok: false, code });
      expect(await r.clearFeedback(identity)).toMatchObject({ ok: false, code });
      await expect(r.flush(true)).resolves.toBeUndefined();
      expect(storage.getItem(RECORDS_KEY)).toBe(before);
    }
  );
  it("permits a hint-free finished give-up, consistent with the finished-attempt contract", async () => {
    const storage = memoryStorage(),
      identity = seed(storage, "give_up"),
      r = recorder(storage);
    expect(await r.setFeedback("struggle", identity)).toMatchObject({ ok: true });
  });
  it("rejects missing identity, unknown attempts, wrong players and invalid feedback", async () => {
    const storage = memoryStorage(),
      r = recorder(storage);
    expect(await r.setFeedback("light")).toEqual({ ok: false, code: "identity_required" });
    const identity = seed(storage);
    const before = storage.getItem(RECORDS_KEY);
    expect(await r.setFeedback("light", { ...identity, attemptId: "missing" })).toMatchObject({
      ok: false,
      code: "attempt_not_found",
    });
    expect(await r.setFeedback("light", { ...identity, playerId: "other" })).toMatchObject({
      ok: false,
      code: "player_mismatch",
    });
    expect(await r.setFeedback(/** @type {any} */ ("invalid"), identity)).toMatchObject({
      ok: false,
      code: "invalid_feedback",
    });
    expect(storage.getItem(RECORDS_KEY)).toBe(before);
  });
  it("preserves old schema-1 feedback on hinted/revealed attempts and rejects new writes", async () => {
    for (const outcome of /** @type {const} */ (["hint", "reveal"])) {
      const storage = memoryStorage(),
        identity = seed(storage, outcome, "light");
      const old = storage.getItem(RECORDS_KEY),
        projected = projectRecords(storedLog(storage));
      expect(projected[0].feedback).toBe("light");
      const r = recorder(storage);
      expect((await r.setFeedback("struggle", identity)).ok).toBe(false);
      expect((await r.clearFeedback(identity)).ok).toBe(false);
      expect(storage.getItem(RECORDS_KEY)).toBe(old);
      expect(projectRecords(storedLog(storage))).toEqual(projected);
    }
  });
  it("serializes two tabs with backward clocks and keeps each action ID", async () => {
    const storage = memoryStorage(),
      identity = seed(storage),
      shared = locks();
    const a = recorder(storage, { locks: shared, now: () => 1000 });
    const b = recorder(storage, { locks: shared, now: () => 1 });
    const results = await Promise.all([
      a.setFeedback("light", identity),
      b.setFeedback("struggle", identity),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(projectRecords(storedLog(storage))[0].feedback).toBe("struggle");
    const events = storedLog(storage).events.filter((e) => e.type === "feedback");
    expect(events.map((e) => e.at)).toEqual([1000, 1000]);
    expect(events.map((e) => e.id)).toEqual(results.map((r) => r.eventId));
  });
  it("retries a delivered write without replacing later feedback from another tab", async () => {
    const storage = memoryStorage(),
      identity = seed(storage),
      shared = locks();
    const a = recorder(storage, { locks: shared }),
      b = recorder(storage, { locks: shared });
    const restore = failVerification(storage, RECORDS_KEY);
    const failed = await a.setFeedback("light", identity);
    expect(failed).toMatchObject({ ok: false, code: "retry_pending" });
    restore();
    expect(await b.setFeedback("struggle", identity)).toMatchObject({ ok: true });
    await a.flush(true);
    const events = storedLog(storage).events.filter((e) => e.type === "feedback");
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe(failed.eventId);
    expect(projectRecords(storedLog(storage))[0].feedback).toBe("struggle");
  });
  it("retries an undelivered write against fresh timestamps after another tab writes", async () => {
    const storage = memoryStorage(),
      identity = seed(storage),
      shared = locks();
    const a = recorder(storage, { locks: shared }),
      b = recorder(storage, { locks: shared, now: () => 5000 });
    const write = storage.setItem;
    storage.setItem = () => {
      throw Error("quota");
    };
    const failed = await a.setFeedback("light", identity);
    expect(failed.ok).toBe(false);
    storage.setItem = write;
    await b.setFeedback("struggle", identity);
    await a.flush(true);
    const last = storedLog(storage).events.at(-1);
    expect(last).toMatchObject({ id: failed.eventId, at: 5000, feedback: "light" });
  });
  it("keeps corrupt and unreadable storage intact, and reports a retryable result", async () => {
    for (const raw of ['{"schema":99}', "{broken"]) {
      const storage = memoryStorage();
      storage.setItem(RECORDS_KEY, raw);
      const r = recorder(storage);
      expect(await r.setFeedback("light", { attemptId: "a", playerId: "player" })).toMatchObject({
        ok: false,
        code: "retry_pending",
      });
      await expect(r.flush(true)).rejects.toThrow();
      expect(storage.getItem(RECORDS_KEY)).toBe(raw);
    }
    const storage = memoryStorage(),
      identity = seed(storage),
      r = recorder(storage);
    const read = storage.getItem;
    storage.getItem = () => {
      throw Error("blocked");
    };
    expect((await r.setFeedback("light", identity)).ok).toBe(false);
    storage.getItem = read;
    await r.flush(true);
    expect(projectRecords(storedLog(storage))[0].feedback).toBe("light");
  });
  it("rejects a conflicting delivered event ID without overwriting it", async () => {
    const storage = memoryStorage(),
      identity = seed(storage),
      r = recorder(storage, { uuid: () => "same" });
    expect((await r.setFeedback("light", identity)).ok).toBe(true);
    expect(await r.setFeedback("struggle", identity)).toMatchObject({
      ok: false,
      code: "conflicting_event_retry",
    });
    expect(projectRecords(storedLog(storage))[0].feedback).toBe("light");
  });
});

describe("persisted unlock high-water mark", () => {
  const options = { playerId: "player", locks: null };
  it("starts at L3 and stores derived L4 without touching attempts", async () => {
    const storage = memoryStorage();
    expect(readUnlockState(storage, "player")).toEqual({ status: "missing", state: null });
    expect(await persistUnlockState(storage, [], options)).toEqual({
      ok: true,
      state: {
        schema: 1,
        playerId: "player",
        maxOpenLevel: 3,
        frontier: { level: 3, at: 0 },
        openings: { 1: { level: 1, at: 0 }, 2: { level: 2, at: 0 }, 3: { level: 3, at: 0 } },
        policy: { unlockInitialLevels: 3, unlockRequiredHintFreeSolves: 10, unlockMaxLevel: 8 },
      },
    });
    const records = wins(),
      before = structuredClone(records);
    storeCompletedAttempts(storage, records);
    expect(await persistUnlockState(storage, records, options)).toMatchObject({
      ok: true,
      state: { maxOpenLevel: 4 },
    });
    expect(readUnlockState(storage, "player")).toMatchObject({
      status: "ok",
      state: { maxOpenLevel: 4 },
    });
    expect(records).toEqual(before);
  });
  it("retains the highest stored level with stale evidence and changed calibration", async () => {
    const storage = memoryStorage();
    storage.setItem(
      UNLOCK_KEY,
      JSON.stringify({
        schema: 1,
        playerId: "player",
        maxOpenLevel: 5,
        extra: "preserved",
        frontier: { level: 5, at: 1 },
        openings: { 5: { level: 5, at: 1 } },
        policy: { unlockInitialLevels: 3, unlockRequiredHintFreeSolves: 20, unlockMaxLevel: 8 },
      })
    );
    const before = storage.getItem(UNLOCK_KEY);
    for (const records of [[], wins()])
      expect(
        await persistUnlockState(storage, records, {
          ...options,
          policy: { unlockRequiredHintFreeSolves: 20 },
        })
      ).toMatchObject({ ok: true, state: { maxOpenLevel: 5, extra: "preserved" } });
    expect(storage.getItem(UNLOCK_KEY)).toBe(before);
  });
  it("does not advance from replays, hints, revealed answers, or unfinished attempts", async () => {
    for (const extra of [
      attempt(20, { puzzle: puzzle(20, 32), replay: true }),
      .../** @type {const} */ (["hint", "reveal", "pause"]).map((outcome) =>
        attempt(20, { puzzle: puzzle(20, 32) }, outcome)
      ),
    ]) {
      const storage = memoryStorage();
      storeAttempts(storage, [...wins(9), extra]);
      expect(await persistUnlockState(storage, [...wins(9), extra], options)).toMatchObject({
        ok: true,
        state: { maxOpenLevel: 3 },
      });
    }
  });
  it.each([
    '{"schema":2,"playerId":"player","maxOpenLevel":4}',
    "{broken",
    "null",
    '{"schema":1,"playerId":"other","maxOpenLevel":4}',
    '{"schema":1,"playerId":"player","maxOpenLevel":99}',
  ])("never replaces unreadable unlock data: %s", async (raw) => {
    const storage = memoryStorage();
    storage.setItem(UNLOCK_KEY, raw);
    expect(readUnlockState(storage, "player").status).toBe("unreadable");
    expect(await persistUnlockState(storage, wins(), options)).toMatchObject({
      ok: false,
      code: "unreadable_storage",
    });
    expect(storage.getItem(UNLOCK_KEY)).toBe(raw);
  });
  it("rejects mixed and mismatched players before accessing storage", async () => {
    const storage = memoryStorage(),
      read = vi.spyOn(storage, "getItem"),
      write = vi.spyOn(storage, "setItem");
    for (const records of [
      [attempt(1, { playerId: "other" })],
      [attempt(1), attempt(2, { playerId: "other" })],
    ])
      expect(await persistUnlockState(storage, records, options)).toMatchObject({
        ok: false,
        code: "invalid_player",
      });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("serializes concurrent stale tabs and retries after a delivered write", async () => {
    const storage = memoryStorage(),
      shared = locks(),
      opts = { ...options, locks: shared };
    storeCompletedAttempts(storage, wins());
    const restore = failVerification(storage, UNLOCK_KEY);
    expect((await persistUnlockState(storage, wins(), opts)).ok).toBe(false);
    restore();
    const results = await Promise.all([
      persistUnlockState(storage, [], opts),
      persistUnlockState(storage, wins(), opts),
    ]);
    expect(results.every((r) => r.ok && r.state.maxOpenLevel === 4)).toBe(true);
    expect(readUnlockState(storage, "player")).toMatchObject({
      status: "ok",
      state: { maxOpenLevel: 4 },
    });
  });
  it("fails closed on blocked reads and retries an undelivered write", async () => {
    const storage = memoryStorage(),
      read = storage.getItem,
      write = storage.setItem;
    storeCompletedAttempts(storage, wins());
    storage.getItem = () => {
      throw Error("blocked");
    };
    const spy = vi.spyOn(storage, "setItem");
    expect(await persistUnlockState(storage, wins(), options)).toMatchObject({
      ok: false,
      code: "unreadable_storage",
    });
    expect(spy).not.toHaveBeenCalled();
    storage.getItem = read;
    storage.setItem = () => {
      throw Error("quota");
    };
    expect((await persistUnlockState(storage, wins(), options)).ok).toBe(false);
    storage.setItem = write;
    expect(await persistUnlockState(storage, wins(), options)).toMatchObject({
      ok: true,
      state: { maxOpenLevel: 4 },
    });
  });
  it("shares the recorder lock, including the no-Web-Locks document fallback", async () => {
    for (const shared of [locks(), null]) {
      const storage = memoryStorage(),
        identity = seed(storage),
        r = recorder(storage, { locks: shared });
      const [feedback, unlock] = await Promise.all([
        r.setFeedback("light", identity),
        persistUnlockState(storage, wins(), { ...options, locks: shared }),
      ]);
      expect(feedback.ok && unlock.ok).toBe(true);
      if (shared) expect(shared.request).toHaveBeenCalledTimes(2);
    }
  });
});

it("does no work before opt-in and reads/writes only its bank keys after opt-in", async () => {
  const storage = memoryStorage();
  storage.data.set("unrelated-key", "keep verbatim");
  const identity = seed(storage),
    original = storage.getItem(RECORDS_KEY);
  const read = vi.spyOn(storage, "getItem"),
    write = vi.spyOn(storage, "setItem");
  const r = recorder(storage);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  r.hint();
  r.time(1);
  r.complete(1);
  await r.flush(true);
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  await r.setFeedback("light", identity);
  await persistUnlockState(storage, wins(), { playerId: "player", locks: null });
  expect(
    read.mock.calls.every(([key]) =>
      [RECORDS_KEY, UNLOCK_KEY, BANK_GAME_KEY, BANK_SAVES_KEY].includes(key)
    )
  ).toBe(true);
  expect(write.mock.calls.every(([key]) => [RECORDS_KEY, UNLOCK_KEY].includes(key))).toBe(true);
  expect(storage.data.get("unrelated-key")).toBe("keep verbatim");
  expect(storedLog(storage).events.slice(0, 2)).toEqual(JSON.parse(original).events);
});

it("empty records reject feedback without creating any storage", async () => {
  const storage = memoryStorage(),
    r = recorder(storage);
  expect(await r.setFeedback("light", { attemptId: "missing", playerId: "player" })).toMatchObject({
    ok: false,
    code: "attempt_not_found",
  });
  expect(storage.data.size).toBe(0);
});

it("persists unlock after an unfinished first attempt resumes and completes", async () => {
  const storage = memoryStorage(),
    data = start(20, { puzzle: puzzle(20, 32) });
  /** @type {import("./types.js").RecordLog} */
  const log = {
    schema: 1,
    events: [
      { id: "start", attemptId: data.attemptId, at: 2000, type: "start", start: data },
      { id: "pause", attemptId: data.attemptId, at: 2001, type: "pause" },
      { id: "resume", attemptId: data.attemptId, at: 3000, type: "resume" },
    ],
  };
  const options = { playerId: "player", locks: null };
  storeCompletedAttempts(storage, wins(9));
  const earlier = storedLog(storage).events;
  storage.setItem(RECORDS_KEY, JSON.stringify({ schema: 1, events: [...earlier, ...log.events] }));
  expect(
    await persistUnlockState(storage, [...wins(9), ...projectRecords(log)], options)
  ).toMatchObject({ ok: true, state: { maxOpenLevel: 3 } });
  log.events.push({ id: "complete", attemptId: data.attemptId, at: 3001, type: "complete" });
  storage.setItem(RECORDS_KEY, JSON.stringify({ schema: 1, events: [...earlier, ...log.events] }));
  expect(
    await persistUnlockState(storage, [...wins(9), ...projectRecords(log)], options)
  ).toMatchObject({ ok: true, state: { maxOpenLevel: 4 } });
});
