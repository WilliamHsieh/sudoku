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

// These assertions inspect rendered output: changing the engine payload alone
// must not leave a second operation summary in the visible panel.
describe("one operation summary in the final hint stage", () => {
  it("renders the real fallback placement once and keeps Apply available", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    expect(hint.stages[2].description).toEqual([hint.effect]);
    const html = panel(hint, 2);
    expect(html.match(/填入 5/g)).toHaveLength(1);
    expect(references(html)).toEqual([0]);
    expect(html.match(/class="hint-effect /g)).toHaveLength(1);
    expect(html).toContain('data-action="apply"');
    expect(html).toContain("套用這一步");
  });

  it("keeps distinct rationale, missing coordinates, and exactly one effect", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    hint.stages[2].description = ["r1c2 與 r1c3 的數字已經確定。", hint.effect];
    hint.stages[2].coordinates = [0, 1, 2, 8];
    const before = JSON.stringify(hint);
    const html = panel(hint, 2);
    expect(html).toContain("的數字已經確定。");
    expect(html.match(/填入 5/g)).toHaveLength(1);
    expect(references(html)).toEqual([1, 2, 8, 0]);
    expect(html).not.toContain("hint-coordinate");
    expect(html).toContain("在棋盤上查看 r1c9（第 1 橫列、第 9 直行）");
    expect(JSON.stringify(hint)).toBe(before);
  });

  it("does not suppress matching text on observation or reasoning pages", () => {
    const hint = findHint(newGame("0" + completed.slice(1), { notesMode: "auto" }));
    for (const stage of [0, 1]) {
      hint.stages[stage].description = [hint.effect];
      expect(panel(hint, stage).match(/填入 5/g)).toHaveLength(1);
    }
  });
});
