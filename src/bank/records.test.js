import { describe, expect, it, vi } from "vitest";
import { applyEvent, projectRecords, readRecords, saveEvent, RECORDS_KEY } from "./records.js";
import { LEGACY_KEYS, inspectLegacySaves } from "./migration.js";
import { attempt, memoryStorage, start } from "./test-fixtures.js";

function session() {
  const data = start(1);
  const event = /** @type {import('./types.js').PlayEvent} */ ({
    id: "start",
    attemptId: data.attemptId,
    at: 1,
    type: "start",
    start: data,
  });
  let log = applyEvent({ schema: 1, events: [] }, event);
  return {
    event,
    get log() {
      return log;
    },
    get record() {
      return projectRecords(log)[0];
    },
    send(/** @type {import('./types.js').PlayEvent} */ e) {
      log = applyEvent(log, e);
    },
  };
}

describe("attempt outcomes and retries", () => {
  it.each([
    ["complete", "independent_complete"],
    ["hint", "hinted_complete"],
    ["reveal", "viewed_answer"],
    ["give_up", "gave_up"],
    ["pause", "paused"],
  ])("%s is %s", (event, outcome) => {
    expect(
      attempt(1, {}, /** @type {'complete'|'hint'|'reveal'|'give_up'|'pause'} */ (event)).outcome
    ).toBe(outcome);
  });
  it("starts in progress and excludes background, pause and close gaps from time", () => {
    const s = session();
    expect(s.record.outcome).toBe("in_progress");
    s.send({ id: "time", attemptId: "attempt-1", at: 1000, type: "time", effectiveMs: 900 });
    for (const type of /** @type {const} */ (["pause", "background", "close"])) {
      s.send({ id: type, attemptId: "attempt-1", at: 2000, type });
      expect(s.record.outcome).toBe("paused");
    }
    expect(() =>
      s.send({
        id: "invalid-time",
        attemptId: "attempt-1",
        at: 4000,
        type: "time",
        effectiveMs: 3000,
      })
    ).toThrow();
    s.send({ id: "resume", attemptId: "attempt-1", at: 90000, type: "resume" });
    expect(s.record.effectiveMs).toBe(900);
    expect(s.record.outcome).toBe("in_progress");
    s.send({ id: "end", attemptId: "attempt-1", at: 99999, type: "complete" });
    expect(s.record.effectiveMs).toBe(900);
  });
  it("does not convert an app crash or no input into a failure or elapsed time", () => {
    const s = session();
    const reloaded = projectRecords(JSON.parse(JSON.stringify(s.log)))[0];
    expect(reloaded).toMatchObject({ outcome: "in_progress", effectiveMs: 0 });
  });
  it("collapses start retries, resume, reload and repeated completion into one attempt", () => {
    const s = session();
    s.send(s.event);
    expect(s.log.events).toHaveLength(1);
    s.send({ id: "resume", attemptId: "attempt-1", at: 2, type: "resume" });
    const complete = /** @type {const} */ ({
      id: "complete",
      attemptId: "attempt-1",
      at: 3,
      type: "complete",
    });
    s.send(complete);
    s.send(complete);
    s.send({ ...complete, id: "retry-new-id", at: 4 });
    expect(projectRecords(JSON.parse(JSON.stringify(s.log)))).toHaveLength(1);
    expect(s.record.endedAt).toBe(3);
    expect(() => s.send({ ...complete, type: "give_up" })).toThrow("Conflicting");
  });
  it("stores omitted feedback as absent, and preserves each explicit feeling", () => {
    expect(attempt(1)).not.toHaveProperty("feedback");
    for (const feedback of /** @type {const} */ (["light", "some_effort", "struggle"]))
      expect(attempt(1, {}, "complete", feedback).feedback).toBe(feedback);
    const s = session();
    s.send({ id: "end", attemptId: "attempt-1", at: 2, type: "complete" });
    s.send({ id: "feeling", attemptId: "attempt-1", at: 3, type: "feedback", feedback: "light" });
    s.send({ id: "skip", attemptId: "attempt-1", at: 4, type: "feedback" });
    expect(s.record).not.toHaveProperty("feedback");
  });
  it("pins catalog, source, puzzle, selection reason and settings history", () => {
    const s = session();
    s.send({
      id: "settings",
      attemptId: "attempt-1",
      at: 2,
      type: "settings",
      settings: { candidateMode: "auto", highlight: true },
    });
    expect(s.record).toMatchObject({
      catalogVersion: "fixture-v1",
      ruleVersion: "selection-v1",
      hintUsed: false,
      answerRevealed: false,
    });
    expect(s.record.settingsHistory.map((h) => h.settings.candidateMode)).toEqual([
      "manual",
      "auto",
    ]);
    expect(s.record.puzzle).toEqual(start(1).puzzle);
  });
  it("recognizes a seen board across catalog versions as a replay", () => {
    const s = session();
    const data = start(2, { puzzle: start(1).puzzle, catalogVersion: "fixture-v2" });
    s.send({ id: "start", attemptId: data.attemptId, at: 2, type: "start", start: data });
    expect(projectRecords(s.log)[1].replay).toBe(true);
  });
});

describe("fail-safe versioned storage and legacy coexistence", () => {
  it("distinguishes missing, damaged, unsupported and unreadable keys", () => {
    const storage = memoryStorage();
    expect(readRecords(storage).status).toBe("missing");
    for (const raw of ["{", "null", '{"schema":2,"events":[]}', '{"schema":1,"events":[{}]}']) {
      storage.setItem(RECORDS_KEY, raw);
      expect(readRecords(storage).status).toBe("unreadable");
    }
    expect(
      readRecords({
        getItem() {
          throw new Error("denied");
        },
      }).status
    ).toBe("unreadable");
  });
  it("reads fresh and never overwrites unreadable records with stale memory", () => {
    const storage = memoryStorage();
    const s = session();
    expect(saveEvent(storage, s.event).ok).toBe(true);
    storage.setItem(RECORDS_KEY, "broken");
    const write = vi.spyOn(storage, "setItem");
    expect(saveEvent(storage, s.event)).toEqual({ ok: false, code: "unreadable_storage" });
    expect(write).not.toHaveBeenCalled();
    expect(storage.getItem(RECORDS_KEY)).toBe("broken");
  });
  it("reports write failure and verification failure", () => {
    const event = session().event;
    expect(
      saveEvent(
        {
          getItem: () => null,
          setItem() {
            throw new Error("quota");
          },
        },
        event
      ).ok
    ).toBe(false);
    expect(saveEvent({ getItem: () => null, setItem() {} }, event)).toEqual({
      ok: false,
      code: "write_not_verified",
    });
  });
  it("retains every old key byte-for-byte, reports unreadable saves, and supplies no NYT mapping", () => {
    const storage = memoryStorage();
    for (const key of LEGACY_KEYS)
      storage.setItem(
        key,
        JSON.stringify({
          "2026-10-01": { Easy: { elapsed: 4, snapshot: { answers: [1], notes: [2], timer: 4 } } },
        })
      );
    const before = [...storage.data];
    const summary = inspectLegacySaves(storage);
    expect(summary).toMatchObject({
      migrationVersion: 1,
      strategy: "retain_legacy_keys",
      comparableEvidence: [],
    });
    expect(summary.reason.codes).toContain("no_nyt_level_mapping");
    expect(summary.saves.every((s) => s.status === "present")).toBe(true);
    expect(saveEvent(storage, session().event).ok).toBe(true);
    expect(inspectLegacySaves(storage)).toEqual(summary);
    for (const [key, value] of before) expect(storage.getItem(key)).toBe(value);
    storage.setItem(LEGACY_KEYS[0], "broken");
    expect(inspectLegacySaves(storage).saves[0].status).toBe("unreadable");
    expect(
      inspectLegacySaves({ getItem: () => null }).saves.every((s) => s.status === "missing")
    ).toBe(true);
  });
});

it("collapses a feedback retry after JSON omits an undefined optional field", () => {
  const storage = memoryStorage();
  const s = session();
  saveEvent(storage, s.event);
  saveEvent(storage, { id: "end", attemptId: "attempt-1", at: 2, type: "complete" });
  const feedback = /** @type {const} */ ({
    id: "skip",
    attemptId: "attempt-1",
    at: 3,
    type: "feedback",
    feedback: undefined,
  });
  expect(saveEvent(storage, feedback).ok).toBe(true);
  expect(saveEvent(storage, feedback).ok).toBe(true);
  const loaded = readRecords(storage);
  if (loaded.status !== "unreadable") expect(loaded.log.events).toHaveLength(3);
});
