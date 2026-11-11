import { expect, it, vi } from "vitest";
import { BANK_GAME_KEY, BANK_SAVES_KEY, BANK_LOCK, createRecorder } from "./recorder.js";
import { memoryStorage, catalogWith } from "./test-fixtures.js";
import { openCatalog } from "./catalog.js";
import { selectPuzzle } from "./select.js";
import { buildBankGameMeta } from "./game-meta.js";
import { readRecords, projectRecords, saveEvent, RECORDS_KEY } from "./records.js";
import { newGame } from "../game/game.js";
import { toSnapshot } from "../game/snapshot.js";

async function metadata(id, playerId = "player") {
  const { catalog } = await openCatalog(catalogWith([10, 11]));
  return buildBankGameMeta(
    selectPuzzle({ catalog, playerId, mode: "manual", level: 1, seed: id }),
    { attemptId: id, playerId, source: catalog.source }
  );
}
function locks() {
  let tail = Promise.resolve();
  return {
    request: vi.fn((name, work) => {
      expect(name).toBe(BANK_LOCK);
      const result = tail.then(work);
      tail = result.catch(() => {});
      return result;
    }),
  };
}
function setup() {
  const storage = memoryStorage();
  const lock = locks();
  let at = 100;
  const recorder = () =>
    createRecorder({ storage, locks: lock, now: () => at++, onError: vi.fn() });
  return { storage, recorder, lock };
}
function recordLog(storage) {
  const result = readRecords(storage);
  if (result.status === "unreadable") throw Error(result.detail);
  return result.log;
}
function slots(storage) {
  return JSON.parse(storage.getItem(BANK_SAVES_KEY)).slots;
}
async function start(recorder, id, playerId = "player") {
  const data = await metadata(id, playerId);
  expect(await recorder.open(data)).toEqual({ meta: data });
  recorder.begin();
  const snapshot = toSnapshot(newGame(data.puzzle.digits));
  recorder.save(snapshot, 0);
  expect(await recorder.flush()).toEqual({ ok: true });
  return snapshot;
}
async function oldSave(storage, id = "old") {
  const meta = await metadata(id);
  const snapshot = toSnapshot(newGame(meta.puzzle.digits));
  snapshot.manualNotes[80] = "139";
  snapshot.autoOverrides.removed[80] = "2";
  snapshot.trustedEliminations = {
    version: 1,
    valuesKey: meta.puzzle.digits,
    removed: Array(81).fill(0),
  };
  expect(
    saveEvent(storage, { type: "start", id: "start", attemptId: id, at: 1, start: meta }).ok
  ).toBe(true);
  expect(
    saveEvent(storage, { type: "time", id: "time", attemptId: id, at: 2, effectiveMs: 7000 }).ok
  ).toBe(true);
  const value = { schema: 1, meta, snapshot, elapsed: 3, effectiveMs: 5000 };
  // Whitespace makes accidental old-key rewriting visible.
  const raw = JSON.stringify(value, null, 2);
  storage.setItem(BANK_GAME_KEY, raw);
  return { raw, value };
}

async function feedbackTarget(storage) {
  const meta = await metadata("done");
  expect(
    saveEvent(storage, {
      type: "start",
      id: "done-start",
      attemptId: "done",
      at: 3,
      start: meta,
    }).ok
  ).toBe(true);
  expect(
    saveEvent(storage, {
      type: "complete",
      id: "done-complete",
      attemptId: "done",
      at: 4,
    }).ok
  ).toBe(true);
  return { attemptId: "done", playerId: "player" };
}

it.each([false, true])(
  "fresh recorder feedback (clear=%s) migrates the old save under the same lock",
  async (clear) => {
    const { storage, lock } = setup();
    const { raw, value } = await oldSave(storage);
    const identity = await feedbackTarget(storage);
    let inside = false;
    const onError = vi.fn();
    const r = createRecorder({
      storage,
      onError,
      now: () => 100,
      locks: {
        request(name, work) {
          return lock.request(name, () => {
            inside = true;
            try {
              return work();
            } finally {
              inside = false;
            }
          });
        },
      },
    });
    const write = storage.setItem;
    storage.setItem = (key, text) => {
      expect(inside).toBe(true);
      if (key === RECORDS_KEY) expect(slots(storage).old).toBeDefined();
      expect(key).not.toBe(BANK_GAME_KEY);
      write(key, text);
    };
    expect(r.meta).toBe(null);
    const result = clear ? await r.clearFeedback(identity) : await r.setFeedback("light", identity);
    expect(result.ok).toBe(true);
    expect(r.meta).toBe(null);
    expect(JSON.parse(slots(storage).old)).toMatchObject({ ...value, playerId: "player" });
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
    expect(projectRecords(recordLog(storage)).find((a) => a.attemptId === "done").feedback).toBe(
      clear ? undefined : "light"
    );
    expect(onError).not.toHaveBeenCalled();
  }
);

it.each([BANK_GAME_KEY, BANK_SAVES_KEY])(
  "fresh recorder feedback fails closed on corrupt %s",
  async (key) => {
    const { storage, recorder } = setup();
    await oldSave(storage);
    const identity = await feedbackTarget(storage);
    storage.setItem(key, '{"schema":99}');
    const before = [...storage.data.entries()];
    const r = recorder();
    expect((await r.setFeedback("light", identity)).ok).toBe(false);
    expect((await r.flush()).ok).toBe(false);
    expect([...storage.data.entries()]).toEqual(before);
  }
);

it.each(["before", "after"])(
  "fresh feedback retries migration failing %s the slot write",
  async (when) => {
    const { storage, recorder } = setup();
    const { raw } = await oldSave(storage);
    const identity = await feedbackTarget(storage);
    const r = recorder();
    const read = storage.getItem,
      write = storage.setItem;
    let failRead = false;
    storage.setItem = (key, text) => {
      if (key === BANK_SAVES_KEY && when === "before") throw Error("slot write blocked");
      write(key, text);
      if (key === BANK_SAVES_KEY) failRead = true;
    };
    storage.getItem = (key) => {
      if (key === BANK_SAVES_KEY && failRead) {
        failRead = false;
        throw Error("verification blocked");
      }
      return read(key);
    };
    expect((await r.setFeedback("light", identity)).ok).toBe(false);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
    storage.setItem = write;
    await r.flush(true);
    expect(Object.keys(slots(storage))).toEqual(["old"]);
    expect(recordLog(storage).events.filter((e) => e.type === "feedback")).toHaveLength(1);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  }
);

it("keeps two boards, resumes an exact slot, and uses recorded cumulative time", async () => {
  const { storage, recorder } = setup();
  const a = recorder(),
    b = recorder();
  const boardA = await start(a, "a");
  const boardB = await start(b, "b");
  boardA.manualNotes[80] = "39";
  boardB.autoOverrides.added[80] = "4";
  a.time(5);
  a.save(boardA, 5);
  b.time(9);
  b.save(boardB, 9);
  await Promise.all([a.flush(true), b.flush(true)]);
  const bRaw = slots(storage).b;
  a.time(8);
  await a.flush(true); // The log is ahead of A's board.
  const restored = recorder();
  expect(await restored.resume("a")).toMatchObject({
    snapshot: boardA,
    elapsed: 5,
    playerId: "player",
  });
  expect(slots(storage).b).toBe(bRaw);
  restored.begin(true);
  restored.time(6);
  restored.save(boardA, 6);
  await restored.flush(true);
  expect(JSON.parse(slots(storage).a).effectiveMs).toBe(9000);
  expect(slots(storage).b).toBe(bRaw);
  expect((await restored.listSlots("player")).items.map((s) => s.attemptId)).toEqual(["a", "b"]);
  expect(await restored.resume("missing")).toBe(null);
});

it("one recorder can start a new session without losing its previous slot", async () => {
  const { storage, recorder } = setup();
  const r = recorder();
  await start(r, "a");
  const original = slots(storage).a;
  await start(r, "b");
  expect(slots(storage).a).toBe(original);
  expect(projectRecords(recordLog(storage))).toHaveLength(2);
});

it("completion removes only its slot after the log confirms it; stale tabs cannot restore it", async () => {
  const { storage, recorder } = setup();
  const a = recorder(),
    b = recorder(),
    stale = recorder();
  const snapshot = await start(a, "a");
  await start(b, "b");
  await stale.resume("a");
  const bRaw = slots(storage).b;
  const write = storage.setItem;
  let block = true;
  storage.setItem = (key, value) => {
    if (block && key === RECORDS_KEY) throw Error("log write blocked");
    if (key === BANK_SAVES_KEY && !JSON.parse(value).slots.a)
      expect(projectRecords(recordLog(storage)).find((a) => a.attemptId === "a").outcome).toBe(
        "independent_complete"
      );
    write(key, value);
  };
  a.complete(0);
  expect((await a.flush()).ok).toBe(false);
  expect(slots(storage).a).toBeDefined();
  block = false;
  await a.flush(true);
  expect(slots(storage)).toEqual({ b: bRaw });
  expect(await recorder().resume("a")).toBe(null);
  stale.save(snapshot, 0);
  expect((await stale.flush()).ok).toBe(false);
  expect(slots(storage)).toEqual({ b: bRaw });
});

it("old saves are read-through only, then migrate with the next normal write", async () => {
  const { storage, recorder } = setup();
  const { raw, value } = await oldSave(storage);
  const r = recorder();
  const write = vi.spyOn(storage, "setItem");
  expect((await r.listSlots("player")).items).toEqual([
    { attemptId: "old", updatedAt: 2, mode: "manual", level: 1, effectiveMs: 7000 },
  ]);
  expect(await r.resume("old")).toMatchObject(value);
  expect(write).not.toHaveBeenCalled();
  r.begin(true);
  await r.flush(true);
  expect(JSON.parse(slots(storage).old)).toMatchObject({ ...value, playerId: "player" });
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  expect(write.mock.calls.every(([key]) => key !== BANK_GAME_KEY)).toBe(true);
  // A new process after the new write, with the old key still present, sees one slot.
  expect((await recorder().listSlots("player")).count).toBe(1);
});

it("two tabs migrate once and preserve a concurrently started different attempt", async () => {
  const { storage, recorder } = setup();
  const { raw } = await oldSave(storage);
  const a = recorder(),
    b = recorder();
  await Promise.all([a.resume("old"), b.resume("old")]);
  a.begin(true);
  b.begin(true);
  await Promise.all([a.flush(true), b.flush(true), start(recorder(), "new")]);
  expect(Object.keys(slots(storage)).sort()).toEqual(["new", "old"]);
  expect((await recorder().listSlots("player")).count).toBe(2);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
});

it.each(["before", "after"])(
  "migration retries a failure %s the new write without losing the only copy",
  async (when) => {
    const { storage, recorder } = setup();
    const { raw } = await oldSave(storage);
    const r = recorder();
    await r.resume("old");
    const read = storage.getItem,
      write = storage.setItem;
    let failRead = false;
    storage.setItem = (key, value) => {
      if (key === BANK_SAVES_KEY && when === "before") throw Error("write blocked");
      write(key, value);
      if (key === BANK_SAVES_KEY) failRead = true;
    };
    storage.getItem = (key) => {
      if (key === BANK_SAVES_KEY && failRead) {
        failRead = false;
        throw Error("verification blocked");
      }
      return read(key);
    };
    r.begin(true);
    expect((await r.flush()).ok).toBe(false);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
    storage.setItem = write;
    await r.flush(true);
    expect(Object.keys(slots(storage))).toEqual(["old"]);
    expect(recordLog(storage).events.filter((e) => e.type === "resume")).toHaveLength(1);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  }
);

it.each([BANK_GAME_KEY, BANK_SAVES_KEY])(
  "corrupt or unknown-schema %s fails closed without any writes",
  async (key) => {
    for (const raw of ["{bad", '{"schema":99}', '{"schema":1}', "null"]) {
      const { storage, recorder } = setup();
      storage.setItem(key, raw);
      const write = vi.spyOn(storage, "setItem");
      const r = recorder();
      expect(await r.open(await metadata("a"))).toBe(null);
      expect(await r.resume("a")).toBe(null);
      expect((await r.listSlots("player")).ok).toBe(false);
      expect(await r.abandon("a", "player")).toMatchObject({ ok: false });
      expect(storage.getItem(key)).toBe(raw);
      expect(write).not.toHaveBeenCalled();
    }
  }
);

it.each([BANK_GAME_KEY, BANK_SAVES_KEY])(
  "a blocked fresh read of %s prevents overwriting existing slots",
  async (key) => {
    const { storage, recorder } = setup();
    const r = recorder();
    const snapshot = await start(r, "a");
    const before = storage.getItem(BANK_SAVES_KEY);
    const read = storage.getItem,
      write = vi.spyOn(storage, "setItem");
    storage.getItem = (k) => {
      if (k === key) throw Error("blocked");
      return read(k);
    };
    r.save(snapshot, 0);
    expect((await r.flush()).ok).toBe(false);
    expect(read(BANK_SAVES_KEY)).toBe(before);
    expect(write).not.toHaveBeenCalled();
    storage.getItem = read;
    await r.flush(true);
  }
);

it("quota failure returns a clear result, preserves other slots, and retries without duplicates", async () => {
  const { storage, recorder } = setup();
  const a = recorder(),
    b = recorder();
  await start(a, "a");
  await b.open(await metadata("b"));
  b.begin();
  await b.flush(true);
  const before = storage.getItem(BANK_SAVES_KEY);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === BANK_SAVES_KEY) throw new DOMException("full", "QuotaExceededError");
    write(key, value);
  };
  b.save(toSnapshot(newGame(b.meta.puzzle.digits)), 0);
  expect(await b.flush()).toEqual({ ok: false, code: "quota_exceeded" });
  expect(storage.getItem(BANK_SAVES_KEY)).toBe(before);
  storage.setItem = write;
  await b.flush(true);
  expect(Object.keys(slots(storage))).toEqual(["a", "b"]);
  expect(recordLog(storage).events.filter((e) => e.type === "start")).toHaveLength(2);
});

it("abandon is explicit, player-scoped, idempotent and does not imply failure", async () => {
  const { storage, recorder } = setup();
  const { raw } = await oldSave(storage);
  const stale = recorder();
  const old = await stale.resume("old");
  const a = recorder();
  await start(a, "a"); // Migrates, but does not abandon the old game.
  const aRaw = slots(storage).a;
  const r = recorder();
  expect(await r.abandon("old", "someone-else")).toEqual({ ok: false, code: "identity_mismatch" });
  expect((await r.listSlots("player")).count).toBe(2);
  expect((await r.abandon("old", "player")).ok).toBe(true);
  expect((await r.abandon("old", "player")).ok).toBe(true);
  expect(slots(storage)).toEqual({ a: aRaw });
  expect(await recorder().resume("old")).toBe(null);
  expect(
    (await r.unfinishedSlots("player")).items.find((s) => s.attemptId === "old")
  ).toMatchObject({ resumable: false, reason: "abandoned" });
  expect(projectRecords(recordLog(storage)).find((a) => a.attemptId === "old").outcome).toBe(
    "in_progress"
  );
  stale.save(old.snapshot, old.elapsed);
  expect((await stale.flush()).ok).toBe(false);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  expect(slots(storage)).toEqual({ a: aRaw });
});

it("joins log-only, inconsistent and consistent attempts in C2 order, scoped to one player", async () => {
  const { storage, recorder } = setup();
  await start(recorder(), "a");
  await start(recorder(), "b");
  await start(recorder(), "foreign", "other");
  const c = recorder();
  await c.open(await metadata("c"));
  c.begin();
  await c.flush(true);
  const store = JSON.parse(storage.getItem(BANK_SAVES_KEY));
  const b = JSON.parse(store.slots.b);
  b.meta.reason.detail = "changed identity";
  b.meta.recommendation.reason.detail = "changed identity";
  store.slots.b = JSON.stringify(b);
  storage.setItem(BANK_SAVES_KEY, JSON.stringify(store));
  const r = recorder();
  expect(
    (await r.unfinishedSlots("player")).items.map(({ attemptId, resumable, reason }) => ({
      attemptId,
      resumable,
      reason,
    }))
  ).toEqual([
    { attemptId: "c", resumable: false, reason: "missing_slot" },
    { attemptId: "b", resumable: false, reason: "inconsistent_slot" },
    { attemptId: "a", resumable: true, reason: null },
  ]);
  expect((await r.listSlots("player")).items.map((s) => s.attemptId)).toEqual(["a"]);
  expect(await r.resume("b")).toBe(null);
  expect((await r.listSlots("")).ok).toBe(false);
});

it("never reads or writes non-bank keys and construction performs no storage access", async () => {
  const { storage, recorder, lock } = setup();
  const access = [];
  const read = storage.getItem,
    write = storage.setItem;
  storage.getItem = (key) => {
    access.push(key);
    return read(key);
  };
  storage.setItem = (key, value) => {
    access.push(key);
    write(key, value);
  };
  const r = recorder();
  expect(access).toEqual([]);
  expect(lock.request).not.toHaveBeenCalled();
  await start(r, "a");
  await r.listSlots("player");
  await r.resume("a");
  await r.abandon("a", "player");
  expect(access.length).toBeGreaterThan(0);
  expect(access.every((key) => key.startsWith("sudoku-bank-"))).toBe(true);
});

it("read-through revisions stay stable if the log advances before migration", async () => {
  const { storage, recorder } = setup();
  const { value } = await oldSave(storage);
  const r = recorder();
  await r.resume("old");
  expect(saveEvent(storage, { type: "hint", id: "external", attemptId: "old", at: 20 }).ok).toBe(
    true
  );
  r.begin(true);
  r.save(value.snapshot, value.elapsed);
  await r.flush(true);
  expect(JSON.parse(slots(storage).old).snapshot).toEqual(value.snapshot);
});

it("a completed old save is never migrated or resumed", async () => {
  const { storage, recorder } = setup();
  const { raw } = await oldSave(storage);
  expect(saveEvent(storage, { type: "complete", id: "done", attemptId: "old", at: 3 }).ok).toBe(
    true
  );
  const r = recorder();
  expect(await r.resume("old")).toBe(null);
  expect((await r.listSlots("player")).count).toBe(0);
  await start(r, "new");
  expect(Object.keys(slots(storage))).toEqual(["new"]);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
});

it("a completed slot cannot resume even when its deletion fails", async () => {
  const { storage, recorder } = setup();
  const r = recorder();
  await start(r, "a");
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === BANK_SAVES_KEY) throw Error("deletion blocked");
    write(key, value);
  };
  r.complete(0);
  expect((await r.flush()).ok).toBe(false);
  expect(slots(storage).a).toBeDefined();
  expect(await recorder().resume("a")).toBe(null);
  expect((await recorder().unfinishedSlots("player")).items).toEqual([]);
  storage.setItem = write;
  await r.flush(true);
  expect(slots(storage)).toEqual({});
});

it("an unverified slot retry preserves another tab's later different slot", async () => {
  const { storage, recorder } = setup();
  const a = recorder(),
    b = recorder();
  const snapshot = await start(a, "a");
  await start(b, "b");
  const read = storage.getItem,
    write = storage.setItem;
  let failRead = false;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === BANK_SAVES_KEY) failRead = true;
  };
  storage.getItem = (key) => {
    if (key === BANK_SAVES_KEY && failRead) {
      failRead = false;
      throw Error("verification blocked");
    }
    return read(key);
  };
  snapshot.manualNotes[80] = "12";
  a.save(snapshot, 0);
  expect((await a.flush()).ok).toBe(false);
  storage.setItem = write;
  b.time(7);
  b.save(toSnapshot(newGame(b.meta.puzzle.digits)), 7);
  await b.flush(true);
  const bRaw = slots(storage).b;
  await a.flush(true);
  expect(slots(storage).b).toBe(bRaw);
  expect(JSON.parse(slots(storage).a).snapshot).toEqual(snapshot);
});

it("an unverified abandon retries without duplicate markers or resurrection", async () => {
  const { storage, recorder } = setup();
  const { raw } = await oldSave(storage);
  const r = recorder();
  const read = storage.getItem,
    write = storage.setItem;
  let failRead = false;
  storage.setItem = (key, value) => {
    write(key, value);
    if (key === BANK_SAVES_KEY) failRead = true;
  };
  storage.getItem = (key) => {
    if (key === BANK_SAVES_KEY && failRead) {
      failRead = false;
      throw Error("verification blocked");
    }
    return read(key);
  };
  expect((await r.abandon("old", "player")).ok).toBe(false);
  storage.setItem = write;
  await r.flush(true);
  expect(JSON.parse(storage.getItem(BANK_SAVES_KEY)).abandoned).toEqual(["old"]);
  expect(await recorder().resume("old")).toBe(null);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
});

it("reports record quota failure without losing earlier slots", async () => {
  const { storage, recorder } = setup();
  const r = recorder();
  await start(r, "a");
  const before = [...storage.data.entries()];
  storage.setItem = () => {
    throw new DOMException("full", "QuotaExceededError");
  };
  r.time(4);
  expect(await r.flush()).toEqual({ ok: false, code: "quota_exceeded" });
  expect([...storage.data.entries()]).toEqual(before);
});

it("a migrated slot wins over the retained old copy, including after a crash", async () => {
  const { storage, recorder } = setup();
  const { raw, value } = await oldSave(storage);
  const r = recorder();
  await r.resume("old");
  r.begin(true);
  value.snapshot.manualNotes[80] = "79";
  r.save(value.snapshot, value.elapsed);
  await r.flush(true);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  const fresh = recorder();
  expect((await fresh.resume("old")).snapshot.manualNotes[80]).toBe("79");
  expect((await fresh.listSlots("player")).count).toBe(1);
});

it.each(["schema", "snapshot", "player", "attempt", "time"])(
  "invalid slot %s is never silently replaced",
  async (field) => {
    const { storage, recorder } = setup();
    await start(recorder(), "a");
    const store = JSON.parse(storage.getItem(BANK_SAVES_KEY));
    const value = JSON.parse(store.slots.a);
    if (field === "schema") value.schema = 99;
    if (field === "snapshot") value.snapshot.answers = "broken";
    if (field === "player") value.playerId = "someone-else";
    if (field === "attempt") value.meta.attemptId = "different-attempt";
    if (field === "time") value.effectiveMs = 1_000_000;
    store.slots.a = JSON.stringify(value);
    const raw = JSON.stringify(store);
    storage.setItem(BANK_SAVES_KEY, raw);
    const r = recorder();
    expect(await r.resume("a")).toBe(null);
    expect((await r.listSlots("player")).items).toEqual([]);
    expect(storage.getItem(BANK_SAVES_KEY)).toBe(raw);
  }
);

it("the no-Web-Locks fallback serializes different attempts in one document", async () => {
  const storage = memoryStorage();
  const a = createRecorder({ storage, locks: null, onError: vi.fn() });
  const b = createRecorder({ storage, locks: null, onError: vi.fn() });
  await Promise.all([start(a, "a"), start(b, "b")]);
  expect(Object.keys(slots(storage)).sort()).toEqual(["a", "b"]);
  expect(projectRecords(recordLog(storage))).toHaveLength(2);
});

it("a fresh recorder can abandon a slot to recover from another recorder's quota failure", async () => {
  const { storage, recorder } = setup();
  await start(recorder(), "a");
  const b = recorder();
  await b.open(await metadata("b"));
  b.begin();
  await b.flush(true);
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === BANK_SAVES_KEY && Object.keys(JSON.parse(value).slots).length > 1)
      throw new DOMException("full", "QuotaExceededError");
    write(key, value);
  };
  b.save(toSnapshot(newGame(b.meta.puzzle.digits)), 0);
  expect(await b.flush()).toEqual({ ok: false, code: "quota_exceeded" });
  expect((await recorder().abandon("a", "player")).ok).toBe(true);
  await b.flush(true);
  expect(Object.keys(slots(storage))).toEqual(["b"]);
});

function limitStorage(storage, extra = 512) {
  const total = () => [...storage.data.values()].reduce((sum, text) => sum + text.length, 0);
  const quota = total() + extra;
  const write = storage.setItem;
  storage.setItem = (key, text) => {
    if (total() - (storage.data.get(key)?.length ?? 0) + text.length > quota)
      throw new DOMException("full", "QuotaExceededError");
    write(key, text);
  };
}

it.each(["old", "sibling"])(
  "abandon %s fits the final store under quota with a pending old-save migration",
  async (id) => {
    const { storage, recorder } = setup();
    await start(recorder(), "sibling");
    const sibling = slots(storage).sibling;
    const { raw, value } = await oldSave(storage);
    const log = storage.getItem(RECORDS_KEY);
    limitStorage(storage);
    const r = recorder();
    expect((await r.listSlots("player")).count).toBe(2);
    expect(await r.abandon(id, "player")).toEqual({ ok: true, code: undefined });
    expect(JSON.parse(storage.getItem(BANK_SAVES_KEY)).abandoned).toEqual([id]);
    if (id === "old") expect(slots(storage)).toEqual({ sibling });
    else {
      expect(Object.keys(slots(storage))).toEqual(["old"]);
      expect(JSON.parse(slots(storage).old)).toMatchObject(value);
    }
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
    expect(storage.getItem(RECORDS_KEY)).toBe(log);
    expect(await recorder().resume(id)).toBe(null);
    const after = [...storage.data.entries()];
    expect((await r.abandon(id, "player")).ok).toBe(true);
    expect([...storage.data.entries()]).toEqual(after);
  }
);

it.each(["old", "new"])("can abandon the only %s slot under quota and repeat it", async (kind) => {
  const { storage, recorder } = setup();
  const old = kind === "old" ? await oldSave(storage) : null;
  if (!old) await start(recorder(), "only");
  const id = old ? "old" : "only";
  const log = storage.getItem(RECORDS_KEY);
  limitStorage(storage);
  const r = recorder();
  expect((await r.abandon(id, "player")).ok).toBe(true);
  expect(JSON.parse(storage.getItem(BANK_SAVES_KEY))).toEqual({
    schema: 1,
    slots: {},
    abandoned: [id],
  });
  expect((await recorder().listSlots("player")).count).toBe(0);
  expect((await r.abandon(id, "player")).ok).toBe(true);
  expect(storage.getItem(RECORDS_KEY)).toBe(log);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(old?.raw ?? null);
});

it("abandon without pending migration preserves its sibling under quota", async () => {
  const { storage, recorder } = setup();
  await start(recorder(), "a");
  await start(recorder(), "b");
  const sibling = slots(storage).b;
  limitStorage(storage, 0);
  expect((await recorder().abandon("a", "player")).ok).toBe(true);
  expect(slots(storage)).toEqual({ b: sibling });
});

it.each(["quota", "blocked"])(
  "a %s abandon write with pending migration leaves every stored byte unchanged and can retry",
  async (failure) => {
    const { storage, recorder } = setup();
    await start(recorder(), "sibling");
    const { raw } = await oldSave(storage);
    const before = [...storage.data.entries()];
    const write = storage.setItem;
    storage.setItem = () => {
      if (failure === "quota") throw new DOMException("full", "QuotaExceededError");
      throw Error("write blocked");
    };
    const r = recorder();
    expect(await r.abandon("old", "player")).toEqual({
      ok: false,
      code: failure === "quota" ? "quota_exceeded" : "write_failed",
    });
    expect([...storage.data.entries()]).toEqual(before);
    storage.setItem = write;
    await r.flush(true);
    expect(Object.keys(slots(storage))).toEqual(["sibling"]);
    expect(JSON.parse(storage.getItem(BANK_SAVES_KEY)).abandoned).toEqual(["old"]);
    expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  }
);

it("concurrent abandons under quota preserve both markers and cannot resurrect the old slot", async () => {
  const { storage, recorder } = setup();
  await start(recorder(), "sibling");
  const { raw } = await oldSave(storage);
  limitStorage(storage);
  const results = await Promise.all([
    recorder().abandon("old", "player"),
    recorder().abandon("sibling", "player"),
  ]);
  expect(results.every((r) => r.ok)).toBe(true);
  const store = JSON.parse(storage.getItem(BANK_SAVES_KEY));
  expect(store.slots).toEqual({});
  expect(store.abandoned.sort()).toEqual(["old", "sibling"]);
  expect((await recorder().listSlots("player")).count).toBe(0);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
});

it("a queued completion deletion folds a newly pending migration into quota recovery", async () => {
  const { storage, recorder } = setup();
  const r = recorder();
  await start(r, "completed");
  const write = storage.setItem;
  storage.setItem = (key, text) => {
    if (key === BANK_SAVES_KEY) throw Error("deletion blocked");
    write(key, text);
  };
  r.complete(0);
  expect((await r.flush()).ok).toBe(false);
  expect(projectRecords(recordLog(storage))[0].outcome).toBe("independent_complete");
  storage.setItem = write;
  // Storage can change after the failed job releases the lock.
  const { raw, value } = await oldSave(storage);
  const log = storage.getItem(RECORDS_KEY);
  limitStorage(storage);
  expect(await r.flush()).toEqual({ ok: true });
  expect(Object.keys(slots(storage))).toEqual(["old"]);
  expect(JSON.parse(slots(storage).old)).toMatchObject(value);
  expect(storage.getItem(BANK_GAME_KEY)).toBe(raw);
  expect(storage.getItem(RECORDS_KEY)).toBe(log);
});
