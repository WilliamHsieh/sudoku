import { afterEach, expect, it, vi } from "vitest";
import { createGame, DEMO_PUZZLE } from "./game/game.svelte.js";
import { puzzleProgress, customProgress } from "./journal/progress.js";
afterEach(() => vi.restoreAllMocks());
it.each([false, true])("Update must stop if the final %s save loses a cross-tab race", (custom) => {
  const store = custom ? customProgress : puzzleProgress;
  vi.spyOn(store, "isCurrent").mockReturnValue(true);
  vi.spyOn(store, "save").mockReturnValue(false);
  const game = createGame();
  game.load(DEMO_PUZZLE, custom ? { custom: true } : { dateStr: "2026-10-22", difficulty: "easy" });
  game.enter(0, 4);
  expect(() => game.flushProgress()).toThrow(/another tab/);
});
