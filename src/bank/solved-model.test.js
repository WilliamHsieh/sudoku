import { describe, it, expect } from "vitest";
import { bankSolvedModel, customSolvedModel } from "./solved-model.js";
import { attempt, puzzle, memoryStorage } from "./test-fixtures.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { persistUnlockState } from "./unlock-storage.js";
import { storeAttempts } from "./unlock-test-fixtures.js";
/** @param {number} i @param {number} [level] @param {import('./types.js').Mode} [mode] @param {boolean} [hint] */
const win = (i, level = 32, mode = "manual", hint = false) => ({
  ...attempt(i, { puzzle: puzzle(i, level), mode }, hint ? "hint" : "complete"),
  effectiveMs: i === 10 ? 402000 : 490000,
});
const model = (history, highest = 3) =>
  bankSolvedModel(history, history.at(-1).attemptId, {
    maxOpenLevel: highest,
    frontier: { level: highest, at: 0 },
  });
describe("signed solved variants", () => {
  it("S1 top shows progress and no streak; new best compares previous same-level times", () => {
    const m = model(Array.from({ length: 7 }, (_, i) => win(i + 4)));
    expect(m.third).toEqual({ label: "unlock L4", value: "7/10", unlocked: false });
    expect(m.streak).toBe(0);
    expect(m.newBest).toBe(true);
    expect(m.feeling).toBe(true);
  });
  it("S2 opens exactly the next level on the tenth solve", () => {
    const m = model(Array.from({ length: 10 }, (_, i) => win(i + 1)));
    expect(m.third.value).toBe("L4");
    expect(m.result.justUnlockedLevel).toBe(4);
    expect(m.label).toBe("Next: L4");
  });
  it.each(/** @type {import("./types.js").Mode[]} */ (["easy", "medium", "hard"]))(
    "S3/S8 %s shows puzzle level, streak, same-mode next; hinted has no feeling",
    (mode) => {
      for (const hint of [false, true]) {
        const m = model([win(1, 32, mode, hint)]);
        expect(m.third.label).toBe("puzzle level");
        expect(m.streak).toBe(1);
        expect(m.feeling).toBe(!hint);
        expect(m.result.countsTowardUnlock).toBe(false);
      }
    }
  );
  it.each([
    [85, 8, "L8"],
    [32, 4, "L3"],
    [26, 3, "L2"],
  ])("S4/S7 count includes hinted, excludes replay, at rating %s", (rating, highest, label) => {
    const history = [
      win(1, rating),
      win(2, rating, "manual", true),
      { ...win(3, rating), replay: true },
    ];
    const m = model(history, highest);
    expect(m.third).toMatchObject({ label: `${label} solved`, value: "2" });
    expect(m.streak).toBe(0);
  });
  it("S4d first solve has no average or new best", () => {
    const m = model([win(1, 85)], 8);
    expect(m.delta).toBeNull();
    expect(m.newBest).toBe(false);
    expect(m.third.value).toBe("1");
  });
  it("S5 custom has no stats or feedback and returns to Custom puzzles", () => {
    expect(customSolvedModel(402)).toMatchObject({
      third: null,
      feeling: false,
      streak: 0,
      lastDelta: null,
      label: "Custom puzzles",
    });
    expect(customSolvedModel(402, -42).lastDelta).toBe(-42);
  });
  it("a replay leaves the displayed frontier counter unchanged", () => {
    const earlier = [win(1), win(2)];
    const replay = { ...win(3), replay: true };
    const m = bankSolvedModel([...earlier, replay], replay.attemptId, projectPlayerUnlock(earlier));
    expect(m.third.value).toBe("2/10");
    expect(m.result.justUnlockedLevel).toBeNull();
    expect(m.result.countsTowardUnlock).toBe(false);
  });
  it("S7 hinted frontier solve preserves the earlier counter", () => {
    const m = model([win(1), win(2), win(3, 32, "manual", true)]);
    expect(m.third.value).toBe("2/10");
    expect(m.feeling).toBe(false);
  });
  it.each(/** @type {import("./types.js").Mode[]} */ (["easy", "medium", "hard"]))(
    "R2 %s never opens levels in pure or persisted state",
    async (mode) => {
      const history = Array.from({ length: 10 }, (_, i) => win(i + 1, 32, mode));
      expect(projectPlayerUnlock(history).maxOpenLevel).toBe(3);
      const storage = memoryStorage();
      storeAttempts(storage, history);
      expect(
        await persistUnlockState(storage, history, { playerId: "player", locks: null })
      ).toMatchObject({ ok: true, state: { maxOpenLevel: 3 } });
    }
  );
});
