import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import HintPanel from "./HintPanel.svelte";

function effectHtml(placements, eliminations) {
  const stage = { title: "可以進行這一步", description: [], coordinates: [] };
  return render(HintPanel, {
    props: {
      session: {
        status: "ready",
        stage: 2,
        isOpen: true,
        didApply: false,
        undoAvailable: false,
        async open() {},
        close() {},
        suspend() {},
        async resume() {},
        reconcile() {},
        apply() {},
        undo() {},
        evidence: () => null,
        previous() {},
        next() {},
        hint: {
          techniqueId: "test",
          name: "測試提示",
          observeCells: [],
          premiseCells: [],
          premiseCandidates: [],
          excludedCandidates: [],
          candidateMasks: Array(81).fill(0),
          stages: [stage, stage, stage],
          placements,
          eliminations,
          effect: placements.length ? "在 r1c1 填入 1。" : "在 r1c1 刪除 1。",
        },
      },
      onclose() {},
      oncoordinate() {},
      docked: true,
    },
  }).body;
}

describe("hint effect action colors", () => {
  it("marks a placement conclusion for the green palette and keeps its explicit action text", () => {
    const html = effectHtml([{ cell: 0, digit: 1 }], []);
    expect(html).toContain("hint-effect-placement");
    expect(html).toContain("填入 1");
  });
  it("keeps elimination and mixed conclusions out of the placement-only palette", () => {
    expect(effectHtml([], [{ cell: 0, digit: 1 }])).not.toContain("hint-effect-placement");
    expect(effectHtml([{ cell: 0, digit: 1 }], [{ cell: 1, digit: 2 }])).not.toContain(
      "hint-effect-placement"
    );
  });
});
