import { describe, expect, it } from "vitest";
import { CALIBRATION as C } from "./calibration.js";
import { deriveUnlockState, mergeMaxOpenLevel } from "./unlock.js";
import { deriveAbility } from "./ability.js";
import { attempt, catalogWith, puzzle } from "./test-fixtures.js";

/** @param {number} rating @param {number} [count] @param {number} [offset] */
const wins = (rating, count = C.unlockRequiredHintFreeSolves, offset = 100) =>
  Array.from({ length: count }, (_, i) =>
    attempt(offset + i, { puzzle: puzzle(offset + i, rating) })
  );

describe("opt-in progressive unlock", () => {
  it("starts at L3 and reports the unsigned default for every level", () => {
    const state = deriveUnlockState([]);
    expect(state.maxOpenLevel).toBe(3);
    expect(Object.keys(state.perLevel)).toHaveLength(8);
    expect(state.perLevel[3]).toEqual({ independentSolves: 0, hintFreeSolves: 0, required: 5 });
  });
  it("requires five distinct hint-free solves at the current frontier", () => {
    expect(deriveUnlockState(wins(32, 4)).maxOpenLevel).toBe(3);
    const state = deriveUnlockState(wins(32));
    expect(state.maxOpenLevel).toBe(4);
    expect(state.perLevel[3]).toEqual({ independentSolves: 5, hintFreeSolves: 5, required: 5 });
  });
  it("cannot skip a missing frontier, even with lower and higher level wins", () => {
    const records = [...wins(10, 20), ...wins(45, 5, 200)];
    expect(deriveUnlockState(records).maxOpenLevel).toBe(3);
    expect(deriveUnlockState([...records, ...wins(32, 5, 300)]).maxOpenLevel).toBe(5);
  });
  it("caps progression at L8 and supports injected policy without persistence", () => {
    const records = [32, 45, 56, 65, 70, 85].flatMap((rating, i) => wins(rating, 5, 100 + i * 10));
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
    const records = wins(32, 4);
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
    const records = wins(32, 4);
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
    const records = wins(32, 4);
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
    expect(deriveUnlockState([...records, replay, primary]).perLevel[3].hintFreeSolves).toBe(5);
    expect(deriveUnlockState([...records, replay]).maxOpenLevel).toBe(3);
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
    const derived = deriveUnlockState(wins(32), { unlockRequiredHintFreeSolves: 10 });
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
