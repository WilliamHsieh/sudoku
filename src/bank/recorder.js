import { readRecords, saveEvent, projectRecords, isTerminal } from "./records.js";
import { validateBankGameMeta } from "./game-meta.js";
import { fromSnapshot } from "../game/snapshot.js";
import { freezeSnapshot } from "./catalog.js";
import { canonical } from "./random.js";
import { unfinishedList } from "./player-api.js";

import { withBankLock } from "./write-lock.js";
export { BANK_LOCK } from "./write-lock.js";

export const BANK_GAME_KEY = "sudoku-bank-game-v1";
export const BANK_SAVES_KEY = "sudoku-bank-saves-v1";
/** @typedef {{schema: 1, meta: import('./types.js').BankGameMeta, snapshot: import('../game/snapshot.js').Snapshot, elapsed: number, effectiveMs: number}} BankSave */
/** @typedef {BankSave & {playerId: string, updatedAt: number}} BankSlot */
/** @typedef {{schema: 1, slots: Record<string, string>, abandoned: string[]}} SaveStore */
/** @param {BankSave} value */
function validateSave(value) {
  if (
    value?.schema !== 1 ||
    !Number.isSafeInteger(value.elapsed) ||
    value.elapsed < 0 ||
    !Number.isSafeInteger(value.effectiveMs) ||
    value.effectiveMs < value.elapsed * 1000
  )
    throw new Error("Invalid bank save");
  validateBankGameMeta(value.meta);
  if (
    value.snapshot?.puzzle !== value.meta.puzzle.digits ||
    !["auto", "manual", "tidy"].includes(value.snapshot.notesMode)
  )
    throw new Error("Bank board mismatch");
  fromSnapshot(value.snapshot);
  return value;
}

/** All bank writes pass through this queue and the same cross-tab lock.
 * Failures leave the failed job queued with its original event ID for retry.
 * @param {{storage?: import('./types.js').Storage, locks?: Pick<LockManager, 'request'> | null,
 * now?: () => number, uuid?: () => string, onError?: (error: unknown) => void}} [options]
 */
export function createRecorder(options = {}) {
  const storage = options.storage ?? {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
  const locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks;
  const now = options.now ?? Date.now;
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const report = options.onError ?? ((error) => console.warn("Bank persistence:", error));
  const fail = (error) => {
    try {
      report(error);
    } catch {
      /* diagnostics cannot break play */
    }
  };
  /** @type {import('./types.js').BankGameMeta | null} */
  let meta = null;
  /** Last successfully read/written checkpoint; compare under the lock. */
  let expected = null;
  let effectiveMs = 0;
  let offset = 0;
  let paused = false;
  let finished = false;
  let begun = false;
  let settings = "auto";
  /** @type {(() => void)[]} */
  const jobs = [];
  /** @type {Promise<void> | null} */
  let draining = null;
  let failureCode = null;

  function locked(work) {
    return withBankLock(locks, work);
  }
  // Callers hold the bank lock. Raw strings are per-slot revisions, so a
  // different attempt's write does not invalidate this recorder's checkpoint.
  function readSaves(log) {
    const raw = storage.getItem(BANK_SAVES_KEY);
    /** @type {SaveStore} */
    const store = raw === null ? { schema: 1, slots: {}, abandoned: [] } : JSON.parse(raw);
    if (
      store?.schema !== 1 ||
      !store.slots ||
      typeof store.slots !== "object" ||
      Array.isArray(store.slots) ||
      !Array.isArray(store.abandoned) ||
      !store.abandoned.every((id) => typeof id === "string" && id.length > 0) ||
      new Set(store.abandoned).size !== store.abandoned.length
    )
      throw new Error("Invalid bank saves store");
    const slots = new Map();
    for (const [id, text] of Object.entries(store.slots)) {
      if (typeof text !== "string") throw new Error("Invalid bank slot text");
      /** @type {BankSlot} */
      const value = JSON.parse(text);
      validateSave(value);
      if (
        id !== value.meta.attemptId ||
        value.playerId !== value.meta.playerId ||
        !Number.isSafeInteger(value.updatedAt) ||
        value.updatedAt <= 0 ||
        store.abandoned.includes(id)
      )
        throw new Error("Invalid bank slot identity");
      slots.set(id, { raw: text, value });
    }
    const oldRaw = storage.getItem(BANK_GAME_KEY);
    let migration = false;
    if (oldRaw !== null) {
      const old = validateSave(JSON.parse(oldRaw));
      const id = old.meta.attemptId;
      const attempt = projectRecords(log).find((a) => a.attemptId === id);
      if (attempt && !isTerminal(attempt) && !slots.has(id) && !store.abandoned.includes(id)) {
        if (!consistent(old, log)) throw new Error("Bank save identity or time mismatch");
        // The old format has no checkpoint date. Use a stable date so later
        // log events cannot change this read-through slot's revision.
        const value = { ...old, playerId: old.meta.playerId, updatedAt: attempt.startedAt };
        const text = JSON.stringify(value);
        store.slots = { ...store.slots, [id]: text };
        slots.set(id, { raw: text, value });
        migration = true;
      }
    }
    return { raw, store, slots, migration };
  }
  function consistent(value, log) {
    const attempt = projectRecords(log).find((a) => a.attemptId === value.meta.attemptId);
    const start = log.events.find(
      (e) => e.type === "start" && e.attemptId === value.meta.attemptId
    );
    return (
      !!attempt &&
      !isTerminal(attempt) &&
      start?.type === "start" &&
      canonical(start.start) === canonical(value.meta) &&
      value.effectiveMs <= attempt.effectiveMs
    );
  }
  function writeSaves(current) {
    const raw = JSON.stringify(current.store);
    if (storage.getItem(BANK_SAVES_KEY) !== current.raw)
      throw new Error("Bank saves changed during write");
    storage.setItem(BANK_SAVES_KEY, raw);
    if (storage.getItem(BANK_SAVES_KEY) !== raw) throw new Error("Bank save not verified");
    // The old key is deliberately never rewritten or deleted, even after verification.
  }
  function records() {
    const result = readRecords(storage);
    if (result.status === "unreadable") throw new Error(result.detail);
    return result.log;
  }
  function append(payload) {
    let writeError;
    const result = saveEvent(
      {
        getItem: (key) => storage.getItem(key),
        setItem: (key, value) => {
          try {
            storage.setItem(key, value);
          } catch (error) {
            writeError = error;
            throw error;
          }
        },
      },
      payload
    );
    if (!result.ok) throw writeError ?? new Error(result.code);
    return result;
  }
  function drain() {
    if (!draining) {
      let failed = false;
      draining = locked(() => {
        failureCode = null;
        while (jobs.length) {
          const current = readSaves(records());
          if (current.migration) writeSaves(current);
          jobs[0]();
          jobs.shift();
        }
      })
        .catch((error) => {
          failed = true;
          failureCode = error?.name === "QuotaExceededError" ? "quota_exceeded" : "write_failed";
          fail(error);
        })
        .finally(() => {
          draining = null;
          // Work can arrive after the lock callback but before this microtask.
          if (!failed && jobs.length) return drain();
        });
    }
    return draining;
  }
  function enqueue(job) {
    jobs.push(job);
    void drain();
  }
  function event(type, extra = {}) {
    if (!meta || finished) return;
    const attemptId = meta.attemptId;
    // Keep the action ID, but rebuild unpersisted events against fresh shared state.
    const id = `${attemptId}:${uuid()}`;
    const running = !paused && ["time", "hint", "settings", "complete"].includes(type);
    let originalAt;
    enqueue(() => {
      const log = records();
      // A prior write may have succeeded before its verification read failed.
      // Its exact stored payload is already accepted; do not rewrite its timestamp.
      const delivered = log.events.find(
        (event) => event.attemptId === attemptId && event.id === id
      );
      if (delivered) {
        const retry = {
          ...delivered,
          type,
          ...extra,
          ...(type === "time" && delivered.type === "time"
            ? { effectiveMs: Math.max(extra.effectiveMs, delivered.effectiveMs) }
            : {}),
        };
        if (canonical(retry) !== canonical(delivered)) throw new Error("Conflicting event retry");
        return;
      }
      let attempt = projectRecords(log).find((a) => a.attemptId === attemptId);
      originalAt ??= now();
      const at = Math.max(1, originalAt, attempt?.updatedAt ?? 0);
      if (running && attempt?.outcome === "paused") {
        const last = log.events.filter((event) => event.attemptId === attemptId).at(-1);
        const resumed = append({
          id: `${id}:resume:${last.id}`,
          attemptId,
          at,
          type: "resume",
        });
        attempt = projectRecords(resumed.log).find((a) => a.attemptId === attemptId);
      }
      const payload = {
        id,
        attemptId,
        at,
        type,
        ...extra,
        ...(type === "time"
          ? { effectiveMs: Math.max(extra.effectiveMs, attempt?.effectiveMs ?? 0) }
          : {}),
      };
      append(payload);
    });
  }
  /** Set, change, or clear local feedback. Explicit identity supports a finished
   * attempt without opening its game. Policy rejection does not block the queue;
   * storage failures retain the job and event ID for flush() retry.
   * @param {import('./types.js').Feedback | undefined} feedback
   * @param {{attemptId?: string, playerId?: string}} [identity]
   * @returns {Promise<{ok: boolean, code?: string, eventId?: string}>} */
  async function setFeedback(feedback, identity = {}) {
    try {
      const attemptId = identity.attemptId ?? meta?.attemptId;
      const playerId = identity.playerId ?? meta?.playerId;
      if (!attemptId || !playerId) return { ok: false, code: "identity_required" };
      if (feedback !== undefined && !["light", "some_effort", "struggle"].includes(feedback))
        return { ok: false, code: "invalid_feedback" };
      const id = `${attemptId}:${uuid()}`;
      /** @type {{ok: boolean, code?: string, eventId?: string}} */
      let result = { ok: false, code: "retry_pending", eventId: id };
      let originalAt;
      enqueue(() => {
        const log = records();
        const attempt = projectRecords(log).find((a) => a.attemptId === attemptId);
        const reject = (code) => {
          result = { ok: false, code, eventId: id };
        };
        if (!attempt) return reject("attempt_not_found");
        if (attempt.playerId !== playerId) return reject("player_mismatch");
        // Check exact delivery before rebuilding timestamps. A later tab may
        // already have changed feedback after our unverified write succeeded.
        const delivered = log.events.find((e) => e.attemptId === attemptId && e.id === id);
        if (delivered) {
          if (canonical({ ...delivered, type: "feedback", feedback }) !== canonical(delivered))
            return reject("conflicting_event_retry");
          result = { ok: true, eventId: id };
          return;
        }
        if (!isTerminal(attempt)) return reject("attempt_not_finished");
        if (attempt.answerRevealed) return reject("answer_revealed");
        if (attempt.hintCount !== 0 || attempt.hintUsed) return reject("hint_used");
        originalAt ??= now();
        append({
          id,
          attemptId,
          type: "feedback",
          feedback,
          at: Math.max(1, originalAt, attempt.updatedAt),
        });
        result = { ok: true, eventId: id };
      });
      await drain();
      return result;
    } catch (error) {
      fail(error);
      return { ok: false, code: "feedback_failed" };
    }
  }
  function time(elapsed) {
    if (!meta || finished || paused) return;
    const next = Math.max(effectiveMs, offset + elapsed * 1000);
    if (next === effectiveMs) return;
    effectiveMs = next;
    event("time", { effectiveMs });
  }
  function save(snapshot, elapsed) {
    if (!meta || finished) return;
    /** @type {BankSlot} */
    const value = structuredClone({
      schema: 1,
      meta,
      playerId: meta.playerId,
      snapshot,
      elapsed,
      effectiveMs,
      updatedAt: Math.max(1, now()),
    });
    enqueue(() => {
      validateSave(value);
      if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0)
        throw new Error("Invalid bank slot timestamp");
      const log = records();
      const current = readSaves(log);
      if (current.store.abandoned.includes(value.meta.attemptId))
        throw new Error("Bank slot was abandoned");
      if (!consistent(value, log)) throw new Error("Bank save identity or time mismatch");
      const raw = JSON.stringify(value);
      const previous = current.slots.get(value.meta.attemptId)?.raw ?? null;
      if (previous !== expected && previous !== raw)
        throw new Error("Bank save changed in another tab");
      current.store.slots = { ...current.store.slots, [value.meta.attemptId]: raw };
      writeSaves(current);
      expected = raw;
    });
  }
  /** Open a fresh session after pending writes succeed. Null keeps the existing
   * latest-save restore entry; resume(attemptId) selects an exact attempt.
   * @param {import('./types.js').BankGameMeta | null} next
   * @param {string} [attemptId] */
  async function open(next, attemptId) {
    try {
      await drain();
      if (jobs.length) return null;
      return await locked(() => {
        const log = records();
        const current = readSaves(log);
        let value;
        if (next) {
          validateBankGameMeta(next);
          if (
            projectRecords(log).some((a) => a.attemptId === next.attemptId) ||
            current.slots.has(next.attemptId) ||
            current.store.abandoned.includes(next.attemptId)
          )
            throw new Error("Attempt already exists; resume it");
        } else {
          value =
            attemptId === undefined
              ? [...current.slots.values()]
                  .map((s) => s.value)
                  .filter((s) => consistent(s, log))
                  .sort(
                    (a, b) =>
                      b.updatedAt - a.updatedAt || (a.meta.attemptId < b.meta.attemptId ? -1 : 1)
                  )[0]
              : current.slots.get(attemptId)?.value;
          if (!value) return null;
          if (!consistent(value, log)) throw new Error("Bank save identity or time mismatch");
        }
        meta = freezeSnapshot(structuredClone(next ?? value.meta));
        const attempt = projectRecords(log).find((a) => a.attemptId === meta.attemptId);
        effectiveMs = next ? 0 : attempt.effectiveMs;
        offset = next ? 0 : effectiveMs - value.elapsed * 1000;
        settings = next ? meta.settings.candidateMode : attempt.settings.candidateMode;
        paused = false;
        finished = false;
        begun = false;
        expected = current.slots.get(meta.attemptId)?.raw ?? null;
        return next ? { meta } : value;
      });
    } catch (error) {
      fail(error);
      return null;
    }
  }
  /** @param {string} playerId */
  async function unfinishedSlots(playerId) {
    try {
      if (typeof playerId !== "string" || !playerId) throw new Error("Player identity required");
      return await locked(() => {
        const log = records();
        const current = readSaves(log);
        const list = unfinishedList(projectRecords(log).filter((a) => a.playerId === playerId));
        const items = list.items.map((item) => {
          const slot = current.slots.get(item.attemptId)?.value;
          const resumable = !!slot && consistent(slot, log);
          return {
            ...item,
            resumable,
            reason: resumable
              ? null
              : current.store.abandoned.includes(item.attemptId)
                ? "abandoned"
                : slot
                  ? "inconsistent_slot"
                  : "missing_slot",
          };
        });
        return { ok: true, items, count: items.length };
      });
    } catch (error) {
      fail(error);
      return { ok: false, code: "read_failed", items: [], count: 0 };
    }
  }
  function removeCompleted(attemptId) {
    enqueue(() => {
      const log = records();
      const attempt = projectRecords(log).find((a) => a.attemptId === attemptId);
      if (!attempt || !isTerminal(attempt)) throw new Error("Completion not recorded");
      const current = readSaves(log);
      if (!current.slots.has(attemptId)) return;
      delete current.store.slots[attemptId];
      writeSaves(current);
    });
  }
  return {
    get meta() {
      return meta;
    },
    open,
    /** @param {string} attemptId */
    resume(attemptId) {
      if (typeof attemptId !== "string" || !attemptId) return Promise.resolve(null);
      return open(null, attemptId);
    },
    unfinishedSlots,
    /** Consistent, resumable slots in unfinishedList order. @param {string} playerId */
    async listSlots(playerId) {
      const result = await unfinishedSlots(playerId);
      const items = result.items
        .filter((item) => item.resumable)
        .map(({ attemptId, updatedAt, mode, level, effectiveMs }) => ({
          attemptId,
          updatedAt,
          mode,
          level,
          effectiveMs,
        }));
      return { ...result, items, count: items.length };
    },
    /** Delete only the checkpoint, not the record or its outcome. A marker stops
     * old saves and stale tabs from resurrecting it. @param {string} attemptId
     * @param {string} playerId */
    async abandon(attemptId, playerId) {
      if (!attemptId || !playerId) return { ok: false, code: "identity_required" };
      let result = { ok: false, code: "retry_pending" };
      enqueue(() => {
        const log = records();
        const attempt = projectRecords(log).find((a) => a.attemptId === attemptId);
        if (!attempt || attempt.playerId !== playerId) {
          result = { ok: false, code: "identity_mismatch" };
          return;
        }
        const current = readSaves(log);
        if (!current.store.abandoned.includes(attemptId)) {
          delete current.store.slots[attemptId];
          current.store.abandoned.push(attemptId);
          writeSaves(current);
        }
        if (meta?.attemptId === attemptId) finished = true;
        result = { ok: true, code: undefined };
      });
      await drain();
      return jobs.length ? { ok: false, code: failureCode ?? "retry_pending" } : result;
    },
    begin(resumed = false) {
      if (begun) return;
      begun = true;
      event(resumed ? "resume" : "start", resumed ? {} : { start: meta });
    },
    save,
    time,
    setFeedback,
    /** @param {{attemptId?: string, playerId?: string}} [identity] */
    clearFeedback(identity) {
      return setFeedback(undefined, identity);
    },
    settings(mode) {
      if (settings === mode) return;
      settings = mode;
      event("settings", { settings: { candidateMode: mode } });
    },
    hint() {
      event("hint", { source: "star" });
    },
    lifecycle(type, elapsed) {
      if (!meta || finished) return;
      if (type === "resume") {
        if (!paused) return;
        event(type);
        paused = false;
      } else {
        if (type === "pause" && paused) return;
        time(elapsed);
        event(type);
        paused = true;
      }
    },
    complete(elapsed) {
      if (!meta || finished) return;
      time(elapsed);
      event("complete");
      finished = true;
      removeCompleted(meta.attemptId);
    },
    restartClock(elapsed) {
      time(elapsed);
      offset = effectiveMs;
    },
    async flush(strict = false) {
      await drain();
      if (strict && jobs.length) throw new Error("Could not save bank progress. Please retry.");
      if (!strict)
        return jobs.length ? { ok: false, code: failureCode ?? "write_failed" } : { ok: true };
    },
  };
}
