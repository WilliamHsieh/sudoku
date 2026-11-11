import { readFileSync } from "node:fs";
import { openCatalog } from "../src/bank/catalog.js";
import { fixedLevelOrder, selectPuzzle } from "../src/bank/select.js";
import { buildBankGameMeta } from "../src/bank/game-meta.js";
import { createRecorder } from "../src/bank/recorder.js";
import { createCustomRecorder } from "../src/bank/custom-recorder.js";
import { memoryStorage } from "../src/bank/test-fixtures.js";
import { solvedState } from "../src/game/solved-state.js";
import { clearCell, newGame } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";
import { expect } from "@playwright/test";

export const NOW = Date.parse("2026-11-11T12:00:00Z");
const opened = openCatalog(
  JSON.parse(
    readFileSync(new URL("../src/bank/published/catalog-v1.json", import.meta.url), "utf8")
  )
);
/** Real published puzzles, written through production recorders. */
export async function fixture({
  level = 3,
  highest = 3,
  count = 0,
  mode = "manual",
  hinted = false,
  replay = false,
  custom = false,
  time = 402,
  priorTime = 490,
  extra = false,
  complete = false,
} = {}) {
  const { catalog } = await opened;
  const storage = memoryStorage();
  let clock = NOW - 86400000 * (count + 1);
  let serial = 0;
  const order = fixedLevelOrder(catalog, level);
  const selection = (p) => ({
    ...selectPuzzle({ catalog, playerId: "local", mode, level, seed: "fixture" }),
    status: "selected",
    puzzle: p,
    puzzleId: p.id,
    selectedRatingBucket: p.ratingTenths,
    candidateRange: { min: p.ratingTenths, max: p.ratingTenths },
  });
  const meta = (p, id) => ({
    ...buildBankGameMeta(selection(p), {
      attemptId: id,
      playerId: "local",
      source: catalog.source,
    }),
    replay: id === "target" && replay,
  });
  async function record(
    p,
    id,
    seconds,
    done,
    hint = false,
    snapshot = toSnapshot(newGame(p.digits))
  ) {
    const recorder = createRecorder({
      storage,
      locks: null,
      now: () => ++clock,
      uuid: () => `event-${++serial}`,
    });
    await recorder.open(meta(p, id));
    recorder.begin();
    if (hint) recorder.hint();
    recorder.time(seconds);
    if (done) recorder.complete(seconds);
    else {
      recorder.save(snapshot, seconds);
      recorder.lifecycle("pause", seconds);
    }
    await recorder.flush(true);
  }
  for (let i = 0; i < count; i++) {
    await record(order[i], `prior-${i}`, priorTime, true);
    clock += 86400000;
  }
  clock = NOW - 10000;
  const puzzle = order[count];
  let board = solvedState(puzzle.digits);
  const last = board.givens.findLastIndex((d) => !d);
  const digit = board.answers[last];
  board = clearCell(board, last).state;
  if (replay) await record(puzzle, "original", priorTime, true);
  if (custom) {
    const recorder = createCustomRecorder({ storage, locks: null });
    await recorder.open("target");
    recorder.save(toSnapshot(board), time, complete);
    await recorder.flush(true);
  } else await record(puzzle, "target", time, complete, hinted, toSnapshot(board));
  if (extra) {
    clock = NOW - 2000;
    await record(order[count + 1], "other", 123, false);
  }
  if (highest > 3)
    storage.setItem(
      "sudoku-bank-unlock-v1",
      JSON.stringify({
        schema: 1,
        playerId: "local",
        maxOpenLevel: highest,
        frontier: { level: highest, at: 1 },
        openings: Object.fromEntries(
          Array.from({ length: highest }, (_, i) => [i + 1, { level: i + 1, at: 1 }])
        ),
      })
    );
  return { storage: Object.fromEntries(storage.data), last, digit, puzzle, index: count + 1 };
}
export async function seed(page, options = {}) {
  const data = await fixture(options);
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((data) => {
    if (!sessionStorage.getItem("bank-seeded")) {
      for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
      sessionStorage.setItem("bank-seeded", "1");
    }
    localStorage.setItem("sudoku-keypad-coach", "1");
  }, data.storage);
  await page.goto("./");
  await expect(page.getByRole("button", { name: /Unfinished/ })).toBeVisible();
  return data;
}
export async function resumeTarget(page, options = {}) {
  const data = await seed(page, options);
  await page.getByRole("button", { name: /Unfinished/ }).click();
  await expect(page.getByRole("heading", { name: "Unfinished" })).toBeVisible();
  const mode = options.custom
    ? "Custom puzzle"
    : ["easy", "medium", "hard"].includes(options.mode)
      ? options.mode[0].toUpperCase() + options.mode.slice(1)
      : `L${options.level ?? 3}`;
  await page
    .getByRole("button", { name: new RegExp(`Resume .* · ${mode}`) })
    .last()
    .click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  return data;
}
export async function finish(page, data) {
  await page.locator(`.board > .cell[data-i="${data.last}"]`).click();
  await page.keyboard.press(String(data.digit));
  await expect(page.locator(".sv-panel")).toBeVisible();
}
export async function solved(page, options = {}) {
  const data = await resumeTarget(page, options);
  await finish(page, data);
  return data;
}
export async function openList(page, level = 3) {
  await page.getByRole("button", { name: "Choose L1–L8" }).click();
  await page.getByRole("button", { name: new RegExp(`^L${level} `) }).click();
  await expect(page.getByRole("group", { name: "篩選" })).toBeVisible();
}
