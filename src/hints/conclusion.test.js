import { describe, expect, it } from "vitest";
import { conclusionRationale } from "./conclusion.js";

describe("conclusion rationale", () => {
  it("removes the identical fallback, including repeated copies", () => {
    const effect = "r1c1 填入 5；r2c2 刪除 3";
    expect(conclusionRationale([effect, effect], effect)).toEqual([]);
  });

  it("ignores surrounding whitespace when comparing a duplicate", () => {
    expect(conclusionRationale(["\n r1c1 填入 5 \t"], "r1c1 填入 5")).toEqual([]);
  });

  it("preserves distinct rationale verbatim, including its premise coordinates", () => {
    const rationale = "r1c2 與 r2c1 至少有一格是 5，因此 r1c1 不能填 5。";
    const effect = "r1c1 刪除 5";
    const description = [rationale, effect];
    expect(conclusionRationale(description, effect)).toEqual([rationale]);
    expect(description).toEqual([rationale, effect]);
  });

  it("does not remove a different action, candidate, or cell", () => {
    const description = ["r1c1 刪除 5", "r1c1 填入 6", "r1c2 填入 5"];
    expect(conclusionRationale(description, "r1c1 填入 5")).toEqual(description);
  });

  it("keeps prose when there is no operation summary", () => {
    expect(conclusionRationale(["觀察 r1c1。"], "")).toEqual(["觀察 r1c1。"]);
    expect(conclusionRationale([], "r1c1 填入 5")).toEqual([]);
  });
});

// Presenting a shorter conclusion must not change the operation that is applied.
it.each([false, true])("keeps all Apply effects with distinct rationale = %s", async (distinct) => {
  const { hintFixture } = await import("./fixtures.mjs");
  const { applyHint } = await import("./hint.js");
  const { hasCandidate } = await import("../game/game.js");
  const { hint, state } = hintFixture("pair");
  const rationale = "r3c5 與 r3c8 佔用了 3、4，其他格不能再用這兩個數字。";
  hint.stages[2].description = distinct ? [rationale, hint.effect] : [hint.effect];
  const original = JSON.stringify({ hint, state });
  expect(conclusionRationale(hint.stages[2].description, hint.effect)).toEqual(
    distinct ? [rationale] : []
  );
  const applied = applyHint(state, hint);
  for (const { cell, digit } of hint.eliminations) {
    expect(hasCandidate(state, cell, digit)).toBe(true);
    expect(hasCandidate(applied, cell, digit)).toBe(false);
  }
  expect(applied.givens).toEqual(state.givens);
  expect(applied.answers).toEqual(state.answers);
  expect(applyHint(applied, hint)).toBe(applied);
  expect(JSON.stringify({ hint, state })).toBe(original);
});
