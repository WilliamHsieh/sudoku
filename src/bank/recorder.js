import { readRecords, saveEvent, projectRecords, isTerminal } from "./records.js";
import { validateBankGameMeta } from "./game-meta.js";
import { fromSnapshot } from "../game/snapshot.js";
import { freezeSnapshot } from "./catalog.js";
import { canonical } from "./random.js";

import { withBankLock } from "./write-lock.js";
export { BANK_LOCK } from "./write-lock.js";

export const BANK_GAME_KEY = "sudoku-bank-game-v1";
/** @typedef {{schema: 1, meta: import('./types.js').BankGameMeta, snapshot: import('../game/snapshot.js').Snapshot, elapsed: number, effectiveMs: number}} BankSave */
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

  function locked(work) {
    return withBankLock(locks, work);
  }
  function readSave() {
    const raw = storage.getItem(BANK_GAME_KEY);
    return { raw, value: raw === null ? null : validateSave(JSON.parse(raw)) };
  }
  function records() {
    const result = readRecords(storage);
    if (result.status === "unreadable") throw new Error(result.detail);
    return result.log;
  }
  function drain() {
    if (!draining) {
      let failed = false;
      draining = locked(() => {
        while (jobs.length) {
          jobs[0]();
          jobs.shift();
        }
      })
        .catch((error) => {
          failed = true;
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
        const resumed = saveEvent(storage, {
          id: `${id}:resume:${last.id}`,
          attemptId,
          at,
          type: "resume",
        });
        if (!resumed.ok) throw new Error(resumed.code);
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
      const result = saveEvent(storage, payload);
      if (!result.ok) throw new Error(result.code);
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
        const saved = saveEvent(storage, {
          id,
          attemptId,
          type: "feedback",
          feedback,
          at: Math.max(1, originalAt, attempt.updatedAt),
        });
        if (!saved.ok) throw new Error(saved.code);
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
    if (!meta) return;
    /** @type {BankSave} */
    const value = structuredClone({ schema: 1, meta, snapshot, elapsed, effectiveMs });
    enqueue(() => {
      validateSave(value);
      const current = readSave();
      const raw = JSON.stringify(value);
      if (current.raw !== expected && current.raw !== raw)
        throw new Error("Bank save changed in another tab");
      storage.setItem(BANK_GAME_KEY, raw);
      if (storage.getItem(BANK_GAME_KEY) !== raw) throw new Error("Bank save not verified");
      expected = raw;
    });
  }
  return {
    get meta() {
      return meta;
    },
    /** @param {import('./types.js').BankGameMeta | null} next null explicitly resumes */
    async open(next) {
      try {
        return await locked(() => {
          const current = readSave();
          const log = records();
          if (next) {
            validateBankGameMeta(next);
            if (
              current.value &&
              !projectRecords(log).some(
                (a) => a.attemptId === current.value.meta.attemptId && isTerminal(a)
              )
            )
              throw new Error("An unfinished bank game already exists");
            if (projectRecords(log).some((a) => a.attemptId === next.attemptId))
              throw new Error("Attempt already exists; resume it");
            meta = freezeSnapshot(structuredClone(next));
            settings = meta.settings.candidateMode;
          } else {
            if (!current.value) return null;
            const attempt = projectRecords(log).find(
              (a) => a.attemptId === current.value.meta.attemptId
            );
            if (!attempt || isTerminal(attempt)) return null;
            const start = log.events.find(
              (e) => e.type === "start" && e.attemptId === attempt.attemptId
            );
            if (start?.type !== "start" || canonical(start.start) !== canonical(current.value.meta))
              throw new Error("Bank save identity mismatch");
            if (current.value.effectiveMs > attempt.effectiveMs)
              throw new Error("Bank save time exceeds recorded time");
            meta = freezeSnapshot(current.value.meta);
            effectiveMs = Math.max(current.value.effectiveMs, attempt.effectiveMs);
            offset = effectiveMs - current.value.elapsed * 1000;
            settings = attempt.settings.candidateMode;
          }
          expected = current.raw;
          return next ? { meta } : current.value;
        });
      } catch (error) {
        fail(error);
        return null;
      }
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
      time(elapsed);
      event("complete");
      finished = true;
    },
    restartClock(elapsed) {
      time(elapsed);
      offset = effectiveMs;
    },
    async flush(strict = false) {
      await drain();
      if (strict && jobs.length) throw new Error("Could not save bank progress. Please retry.");
    },
  };
}
