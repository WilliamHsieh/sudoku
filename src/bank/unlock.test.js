import { describe, expect, it, vi } from "vitest";
import { CALIBRATION as C } from "./calibration.js";
import { deriveUnlockState, mergeMaxOpenLevel } from "./unlock.js";
import { deriveAbility } from "./ability.js";
import { LEGACY_KEYS } from "./migration.js";
import { projectRecords, readRecords, RECORDS_KEY } from "./records.js";
import { attempt, catalogWith, memoryStorage, puzzle, start } from "./test-fixtures.js";

/** @param {number} rating @param {number} [count] @param {number} [offset] */
const wins = (rating, count = C.unlockRequiredHintFreeSolves, offset = 100) =>
  Array.from({ length: count }, (_, i) =>
    attempt(offset + i, { puzzle: puzzle(offset + i, rating) })
  );

describe("opt-in progressive unlock", () => {
  it("starts at L3 and reports the signed-off requirement for every level", () => {
    const state = deriveUnlockState([]);
    expect(state.maxOpenLevel).toBe(3);
    expect(Object.keys(state.perLevel)).toHaveLength(8);
    expect(state.perLevel[3]).toEqual({ independentSolves: 0, hintFreeSolves: 0, required: 10 });
  });
  it("requires ten distinct hint-free solves at the current frontier", () => {
    expect(deriveUnlockState(wins(32, 9)).maxOpenLevel).toBe(3);
    const state = deriveUnlockState(wins(32));
    expect(state.maxOpenLevel).toBe(4);
    expect(state.perLevel[3]).toEqual({ independentSolves: 10, hintFreeSolves: 10, required: 10 });
  });
  it("cannot skip a missing frontier, even with lower and higher level wins", () => {
    const records = [...wins(10, 20), ...wins(45, 10, 200)];
    expect(deriveUnlockState(records).maxOpenLevel).toBe(3);
    expect(deriveUnlockState([...records, ...wins(32, 10, 300)]).maxOpenLevel).toBe(5);
  });
  it("caps progression at L8 and supports injected policy without persistence", () => {
    const records = [32, 45, 56, 65, 70, 85].flatMap((rating, i) => wins(rating, 10, 100 + i * 10));
    expect(deriveUnlockState(records).maxOpenLevel).toBe(8);
    expect(
      deriveUnlockState(wins(26, 2), {
        unlockInitialLevels: 2,
        unlockRequiredHintFreeSolves: 2,
        unlockMaxLevel: 4,
      }).maxOpenLevel
    ).toBe(3);
    expect(deriveUnlockState(records, { unlockMaxLevel: 5 }).maxOpenLevel).toBe(5);
  });
  it.each(["hint", "reveal", "give_up", "pause"])("does not unlock from %s attempts", (outcome) => {
    const records = wins(32, 9);
    records.push(
      attempt(
        200,
        { puzzle: puzzle(200, 32) },
        /** @type {'hint'|'reveal'|'give_up'|'pause'} */ (outcome)
      )
    );
    expect(deriveUnlockState(records).maxOpenLevel).toBe(3);
  });
  it("fails closed for inconsistent or missing hint/answer evidence", () => {
    const records = wins(32, 9);
    for (const changes of [
      { hintCount: 1 },
      { hintUsed: true },
      { hintCount: undefined },
      { answerRevealed: true },
    ])
      expect(
        deriveUnlockState([...records, { ...wins(32, 1, 200)[0], ...changes }]).maxOpenLevel
      ).toBe(3);
  });
  it("uses the same first attempt identity and replay exclusion as ability", () => {
    const records = wins(32, 9);
    const first = attempt(200, { puzzle: puzzle(200, 32) }, "give_up");
    const retry = {
      ...first,
      attemptId: "second",
      startedAt: first.startedAt + 1,
      outcome: /** @type {const} */ ("independent_complete"),
    };
    expect(deriveUnlockState([...records, first, retry, ...records]).maxOpenLevel).toBe(3);
    const primary = wins(32, 1, 300)[0];
    const replay = {
      ...primary,
      replay: true,
      attemptId: "a-replay",
      startedAt: primary.startedAt - 1,
    };
    expect(deriveUnlockState([...records, replay, primary]).perLevel[3].hintFreeSolves).toBe(10);
    expect(deriveUnlockState([...records, replay]).maxOpenLevel).toBe(3);
  });
  it.each(["star", "fill", "hint_dot"])(
    "uses only star-key hints to qualify the tenth solve (%s)",
    (source) => {
      const data = start(200, { puzzle: puzzle(200, 32) });
      const records = projectRecords({
        schema: 1,
        events: [
          { id: "start", attemptId: data.attemptId, at: 1, type: "start", start: data },
          { id: "assist", attemptId: data.attemptId, at: 2, type: "hint", source },
          { id: "complete", attemptId: data.attemptId, at: 3, type: "complete" },
        ],
      });
      expect(records[0].hintCount).toBe(source === "star" ? 1 : 0);
      expect(deriveUnlockState([...wins(32, 9), ...records]).maxOpenLevel).toBe(
        source === "star" ? 3 : 4
      );
    }
  );
  it("starts fresh at L1–L3 when only legacy saves exist", () => {
    const storage = memoryStorage();
    for (const key of LEGACY_KEYS)
      storage.setItem(
        key,
        JSON.stringify({ "2026-11-10": { Hard: { solved: true, elapsed: 120 } } })
      );
    const before = [...storage.data];
    const reads = vi.spyOn(storage, "getItem");
    const loaded = readRecords(storage);
    expect(loaded.status).toBe("missing");
    if (loaded.status === "unreadable") throw new Error("Expected empty bank records");
    const state = deriveUnlockState(projectRecords(loaded.log));
    expect(state.maxOpenLevel).toBe(3);
    expect(Object.values(state.perLevel).every((level) => level.hintFreeSolves === 0)).toBe(true);
    expect(reads.mock.calls).toEqual([[RECORDS_KEY]]);
    expect([...storage.data]).toEqual(before);
    reads.mockRestore();
  });
  it("keeps Easy-only ability ceilings unchanged even when unlock evidence grows", () => {
    const records = wins(32, 20).map((a) => ({
      ...a,
      mode: /** @type {const} */ ("easy"),
      feedback: /** @type {const} */ ("light"),
    }));
    const options = { catalog: catalogWith([10, 12, 13, 15, 32, 35, 45]), playerId: "player" };
    expect(deriveUnlockState(records).maxOpenLevel).toBe(4);
    expect(deriveAbility({ ...options, records }).bands).toEqual(deriveAbility(options).bands);
  });
  it("keeps earned levels when calibration changes", () => {
    const derived = deriveUnlockState(wins(32), { unlockRequiredHintFreeSolves: 20 });
    expect(derived.maxOpenLevel).toBe(3);
    expect(mergeMaxOpenLevel(5, derived.maxOpenLevel)).toBe(5);
    expect(mergeMaxOpenLevel(3, 6)).toBe(6);
    expect(mergeMaxOpenLevel(8, 8)).toBe(8);
  });
  it("rejects invalid policies and mixed-player evidence", () => {
    for (const policy of [
      { unlockInitialLevels: 0 },
      { unlockMaxLevel: 9 },
      { unlockMaxLevel: 2 },
      { unlockRequiredHintFreeSolves: 0 },
      { unlockRequiredHintFreeSolves: 1.5 },
    ])
      expect(() => deriveUnlockState([], policy)).toThrow();
    expect(() => deriveUnlockState([wins(32)[0], { ...wins(32)[1], playerId: "other" }])).toThrow(
      "one player"
    );
    expect(() => mergeMaxOpenLevel(0, 3)).toThrow();
  });
});
