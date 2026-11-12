import { loadPublished } from "./loadPublished.js";
import { readRecords, projectRecords } from "./records.js";
import { readUnlockState, persistUnlockState } from "./unlock-storage.js";
import { projectPlayerUnlock } from "./player-unlock.js";
import { createCustomRecorder, customPuzzles } from "./custom-recorder.js";
import { createRecorder } from "./recorder.js";
import { selectPuzzle } from "./select.js";
import { buildBankGameMeta } from "./game-meta.js";
import { readRecommendations, recentPicks, saveRecommendation } from "./recommendations.js";
import { withBankLock } from "./write-lock.js";
import { levelList } from "./player-api.js";

/** One local profile; no identity or legacy migration is needed. */
export const PLAYER_ID = "local";
export function createBankUI() {
  let catalog = $state.raw(/** @type {import('./types.js').Catalog | null} */ (null));
  let attempts = $state.raw(/** @type {import('./types.js').Attempt[]} */ ([]));
  let unlock = $state.raw(projectPlayerUnlock([]));
  let slots = $state.raw(
    /** @type {Awaited<ReturnType<ReturnType<typeof createRecorder>['listSlots']>>['items']} */ ([])
  );
  let error = $state("");
  const recorder = createRecorder();
  const custom = createCustomRecorder();
  let customSlots = $state.raw(/** @type {import("./custom-recorder.js").CustomSlot[]} */ ([]));
  const customItems = $derived(customPuzzles(customSlots));
  async function refresh() {
    const read = readRecords(localStorage);
    if (read.status === "unreadable") throw new Error("Could not read saved games.");
    const all = projectRecords(read.log);
    // This UI has one local profile. Reject unexpected identities rather than hiding data.
    if (all.some((a) => a.playerId !== PLAYER_ID))
      throw new Error("Saved player identity does not match.");
    const saved = readUnlockState(localStorage, PLAYER_ID);
    if (saved.status === "unreadable") throw new Error("Could not read unlocked levels.");
    attempts = all;
    unlock = projectPlayerUnlock(all, saved.state ?? {});
    const list = await recorder.listSlots(PLAYER_ID);
    if (!list.ok) throw new Error("Could not read unfinished games.");
    slots = list.items;
    customSlots = await custom.all();
  }
  return {
    get catalog() {
      return catalog;
    },
    get attempts() {
      return attempts;
    },
    get unlock() {
      return unlock;
    },
    get slots() {
      return [
        ...slots,
        ...customSlots
          .filter((s) => !s.completed)
          .map((s) => ({
            attemptId: s.attemptId,
            updatedAt: s.updatedAt,
            mode: "custom",
            label: customItems.find((i) => i.puzzle.digits === s.puzzle)?.title,
            level: 0,
            effectiveMs: s.elapsed * 1000,
          })),
      ].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    get customItems() {
      return customItems;
    },
    get error() {
      return error;
    },
    async init() {
      try {
        catalog = await loadPublished();
        await refresh();
      } catch (e) {
        error = e.message;
      }
    },
    refresh,
    async checkpoint() {
      const saved = await persistUnlockState(localStorage, attempts, {
        playerId: PLAYER_ID,
        locks: navigator.locks,
      });
      if (!saved.ok) throw new Error("Could not save unlocked levels. Please retry.");
      await refresh();
    },
    /** @param {import('./types.js').Level} level */
    list(level) {
      const list = levelList(catalog, attempts, level, { playerId: PLAYER_ID });
      const items = list.items.map((item) => {
        const attempt = attempts
          .filter(
            (a) =>
              a.puzzle.digits === item.puzzle.digits &&
              ["in_progress", "paused"].includes(a.outcome)
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        const slot = attempt && slots.find((s) => s.attemptId === attempt.attemptId);
        return {
          ...item,
          name: `第 ${item.index} 題`,
          active: attempt
            ? {
                attemptId: attempt.attemptId,
                effectiveMs: attempt.effectiveMs,
                updatedAt: attempt.updatedAt,
                answers: slot?.answers ?? null,
              }
            : null,
        };
      });
      return { ...list, items };
    },
    /** @param {import('./types.js').Mode} mode @param {import('./types.js').Level} [level] @param {import('./types.js').Puzzle} [puzzle] */
    async choose(mode, level, puzzle) {
      await refresh();
      const prior = readRecommendations(localStorage);
      if (prior.status === "unreadable") throw new Error("Could not read puzzle selections.");
      let selection = selectPuzzle({
        catalog,
        records: attempts,
        playerId: PLAYER_ID,
        mode,
        level,
        maxOpenLevel: /** @type {import('./types.js').Level} */ (unlock.maxOpenLevel),
        seed: crypto.randomUUID(),
        recentRecommendations: recentPicks(prior.log, PLAYER_ID),
      });
      if (puzzle) {
        if (
          mode !== "manual" ||
          level > unlock.maxOpenLevel ||
          puzzle.level !== level ||
          !catalog.puzzles.some((p) => p.id === puzzle.id && p.digits === puzzle.digits)
        )
          throw new Error("This puzzle is unavailable.");
        selection = {
          ...selection,
          status: "selected",
          puzzle,
          puzzleId: puzzle.id,
          selectedRatingBucket: puzzle.ratingTenths,
        };
      }
      if (selection.status !== "level_locked") {
        const saved = await withBankLock(navigator.locks, () =>
          saveRecommendation(localStorage, {
            id: crypto.randomUUID(),
            playerId: PLAYER_ID,
            at: Date.now(),
            snapshot: selection,
          })
        );
        if (!saved.ok) throw new Error("Could not save puzzle selection.");
      }
      return selection;
    },
    /** @param {import('./select.js').Selection} selection */
    meta(selection) {
      return buildBankGameMeta(selection, {
        attemptId: crypto.randomUUID(),
        playerId: PLAYER_ID,
        source: catalog.source,
      });
    },
    /** @param {import('./types.js').Feedback | undefined} feedback @param {string} attemptId */
    async feedback(feedback, attemptId) {
      const result = await recorder.setFeedback(feedback, { attemptId, playerId: PLAYER_ID });
      if (!result.ok) throw new Error("Could not save your feedback. Please retry.");
      await refresh();
    },
  };
}
