import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HintPanel from "./HintPanel.svelte";
import { findHint } from "./engine.js";
import { newGame } from "../game/game.js";

const completed =
  "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

function panel(hint, stage = 0) {
  return render(HintPanel, {
    props: {
      session: {
        status: "ready",
        stage,
        hint,
        isOpen: true,
        didApply: false,
        undoAvailable: false,
        async open() {},
        close() {},
        reconcile() {},
        apply() {},
        undo() {},
        evidence: () => null,
        previous() {},
        next() {},
      },
      onclose() {},
      oncoordinate() {},
      docked: true,
    },
  }).body;
}

const references = (html) =>
  [...html.matchAll(/class="hint-reference[^"]*"[^>]*data-cell="(\d+)"/g)].map((m) => Number(m[1]));

describe("hint coordinates without duplicate chips", () => {
  it("removes the colored row and keeps every full-house premise reachable inline", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    for (let stage = 0; stage < 3; stage++) {
      const html = panel(hint, stage);
      expect(html).not.toContain("hint-coordinate");
      for (const cell of hint.stages[stage].coordinates) expect(references(html)).toContain(cell);
      expect(html).toContain("在棋盤上查看 r1c1（第 1 橫列、第 1 直行）");
    }
  });

  it("supplements only coordinates absent from the title and description, in original order", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    hint.stages[0] = {
      title: "觀察 r1c1",
      description: ["比較 r1c2。"],
      coordinates: [0, 1, 8, 7, 8],
    };
    const before = JSON.stringify(hint);
    const html = panel(hint);
    expect(references(html)).toEqual([0, 1, 8, 7]);
    expect(html).toContain("另請查看");
    expect(JSON.stringify(hint)).toBe(before);
  });

  it("counts effect references only when the conclusion is visible", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    const step = { title: "觀察", description: ["只剩一格。"], coordinates: [0] };
    hint.stages = [step, step, step];
    expect(references(panel(hint, 0))).toEqual([0]);
    expect(references(panel(hint, 1))).toEqual([0]);
    const html = panel(hint, 2);
    expect(references(html)).toEqual([0]);
    expect(html).not.toContain("另請查看");
  });

  it("adds no sentence when all coordinates are already inline or the list is empty", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    for (const coordinates of [[], [0, 1]]) {
      hint.stages[0] = { title: "觀察 r1c1", description: ["比較 r1c2。"], coordinates };
      const html = panel(hint);
      expect(html).not.toContain("另請查看");
      expect(references(html)).toEqual([0, 1]);
    }
  });
});
