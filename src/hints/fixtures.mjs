// Capture fixtures only. Not imported by the production entry point.
import {
  newGame,
  setAnswer,
  toggleCandidate,
  hasCandidate,
  computedCandidates,
} from "../game/game.js";
import { hintStateKey } from "./hint.js";
import { hintExampleCopy } from "./example-copy.js";
import xwing from "./fixtures/xwing.json";

export function hintFixture(name = "xwing") {
  const examples = {
    xwing: {
      puzzle: xwing.puzzle,
      setup: xwing.values,
      masks: xwing.candidates,
      observe: [
        ...Array.from({ length: 9 }, (_, i) => i),
        ...Array.from({ length: 9 }, (_, i) => 72 + i),
      ],
      sources: xwing.corners,
      digits: [1],
      excluded: [],
      placements: [],
      eliminations: xwing.targets.map((cell) => ({ cell, digit: 1 })),
    },
    hidden: {
      puzzle: "054080630610004789390000001070309000800040006000806070200000017567200094089070260",
      observe: [0, 1, 2, 9, 10, 11, 18, 19, 20],
      sources: [15, 65],
      digits: [],
      excluded: [
        { cell: 11, digit: 7 },
        { cell: 20, digit: 7 },
      ],
      placements: [{ cell: 0, digit: 7 }],
      eliminations: [],
    },
    // Contains an earlier Naked Single; this is a targeted visual example only.
    pair: {
      puzzle: "094000560200058790075900102402605009607020010000710605001092080080060200320001007",
      observe: [18, 19, 20, 21, 22, 23, 24, 25, 26],
      sources: [22, 25],
      digits: [3, 4],
      excluded: [],
      placements: [],
      eliminations: [
        { cell: 23, digit: 3 },
        { cell: 23, digit: 4 },
      ],
    },
  };
  const example = examples[name] ?? examples.xwing;
  const copy = hintExampleCopy[name] ?? hintExampleCopy.xwing;
  let state = newGame(example.puzzle, { notesMode: "auto" });
  if (example.setup) {
    for (let i = 0; i < 81; i++)
      if (!state.givens[i] && example.setup[i] !== "0")
        state = setAnswer(state, i, Number(example.setup[i])).state;
    for (let i = 0; i < 81; i++)
      for (let d = 1; d <= 9; d++)
        if (hasCandidate(state, i, d) && !(example.masks[i] & (1 << d)))
          state = toggleCandidate(state, i, d).state;
  }
  /** @type {import('./hint.js').Hint} */
  const hint = {
    techniqueId: name,
    name: copy.name,
    stages:
      /** @type {[import('./hint.js').HintStage, import('./hint.js').HintStage, import('./hint.js').HintStage]} */ (
        [copy.observe, copy.reason, copy.conclusion].map((s, i) => ({
          title: s.title,
          description: Array.isArray(s.description) ? s.description : [s.description],
          coordinates:
            i === 1
              ? example.sources
              : i === 2
                ? [...new Set([...example.placements, ...example.eliminations].map((p) => p.cell))]
                : [],
        }))
      ),
    observeCells: example.observe,
    premiseCells: example.sources,
    premiseCandidates: example.sources.flatMap((cell) =>
      example.digits.map((digit) => ({ cell, digit }))
    ),
    excludedCandidates: example.excluded,
    placements: example.placements,
    eliminations: example.eliminations,
    candidateMasks:
      example.masks ?? Array.from({ length: 81 }, (_, i) => computedCandidates(state, i)),
    effect: copy.conclusion.effect,
  };
  const key = hintStateKey(state);
  return {
    state,
    hint,
    provider: async (current) => (hintStateKey(current) === key ? hint : null),
  };
}
