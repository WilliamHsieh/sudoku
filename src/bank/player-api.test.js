import { describe, expect, it, vi } from "vitest";
import { dayStreak, levelList, solveResult, unfinishedList } from "./player-api.js";
import { attempt, catalogWith, puzzle, start } from "./test-fixtures.js";
import { openCatalog } from "./catalog.js";
import { fixedLevelOrder, selectPuzzle } from "./select.js";
import { projectRecords } from "./records.js";
import { deriveUnlockState } from "./unlock.js";

const wins = (count = 10, rating = 32, offset = 1) =>
  Array.from({ length: count }, (_, i) =>
    attempt(offset + i, { puzzle: puzzle(offset + i, rating) })
  );
const result = (attempts, target = attempts.at(-1), previousMaxOpenLevel = 3) =>
  solveResult(attempts, target.attemptId, { previousMaxOpenLevel });

function resumed() {
  const data = start(1, { puzzle: puzzle(1, 32) });
  const events = [
    { id: "start", at: 100, type: "start", start: data },
    { id: "time", at: 101, type: "time", effectiveMs: 1234 },
    { id: "pause", at: 102, type: "pause" },
    { id: "resume", at: 200, type: "resume" },
    { id: "complete", at: 201, type: "complete" },
  ].map((event) => ({ ...event, attemptId: data.attemptId }));
  return /** @type {import('./types.js').RecordLog} */ ({ schema: 1, events });
}

describe("solve result", () => {
  it("reports the tenth frontier solve and the next opened level", () => {
    expect(result(wins())).toEqual({
      level: 3,
      mode: "medium",
      countsTowardUnlock: true,
      hintFreeSolvesAtLevel: 10,
      required: 10,
      justUnlockedLevel: 4,
      levelSolvedDistinct: 10,
    });
    expect(result(wins(9))).toMatchObject({ hintFreeSolvesAtLevel: 9, justUnlockedLevel: null });
  });
  it("reports results at completion, even after later solves and feedback", () => {
    const history = [...wins(), ...wins(10, 45, 20)];
    const target = {
      ...history[9],
      feedback: /** @type {const} */ ("struggle"),
      updatedAt: 100_000,
    };
    history[9] = target;
    expect(result([...history].reverse(), target)).toMatchObject({
      justUnlockedLevel: 4,
      levelSolvedDistinct: 10,
    });
  });
  it("uses completion order and the same equal-time tie rule as unlock", () => {
    const base = wins(9);
    const tenth = { ...wins(1, 32, 10)[0], attemptId: "b", endedAt: 2001 };
    const early = { ...wins(1, 45, 11)[0], attemptId: "a", endedAt: 2001 };
    expect(result([...base, tenth, early], early)).toMatchObject({
      countsTowardUnlock: false,
      hintFreeSolvesAtLevel: 0,
    });
    const late = { ...early, attemptId: "c" };
    expect(result([...base, tenth, late], late, 4)).toMatchObject({
      countsTowardUnlock: true,
      hintFreeSolvesAtLevel: 1,
    });
  });
  it("excludes replays and below-frontier solves from progress", () => {
    const below = wins(1, 32, 30)[0];
    const replay = attempt(31, { puzzle: puzzle(1, 32), replay: true });
    for (const target of [below, replay])
      expect(result([...wins(), target], target, 4)).toMatchObject({
        countsTowardUnlock: false,
        hintFreeSolvesAtLevel: 0,
        justUnlockedLevel: null,
      });
    expect(result([...wins(), replay], replay, 4).levelSolvedDistinct).toBe(10);
    expect(result([...wins(), below], below, 4).levelSolvedDistinct).toBe(11);
  });
  it("never re-locks a stored frontier or reports a lower-level unlock", () => {
    const history = wins();
    expect(
      solveResult(history, history.at(-1).attemptId, {
        previousMaxOpenLevel: 5,
        frontier: { level: 5, at: 1 },
      })
    ).toMatchObject({
      countsTowardUnlock: false,
      hintFreeSolvesAtLevel: 0,
      justUnlockedLevel: null,
    });
  });
  it("includes hinted boards in the distinct count without unlock credit", () => {
    const hinted = attempt(20, { puzzle: puzzle(20, 32) }, "hint");
    expect(result([...wins(9), hinted])).toMatchObject({
      countsTowardUnlock: false,
      hintFreeSolvesAtLevel: 9,
      levelSolvedDistinct: 10,
    });
    const below = attempt(21, { puzzle: puzzle(21, 10) }, "hint");
    expect(result([below])).toMatchObject({ hintFreeSolvesAtLevel: 0, levelSolvedDistinct: 1 });
  });
  it("does not replace an unfinished or unsuccessful first attempt", () => {
    for (const outcome of /** @type {const} */ (["pause", "give_up"])) {
      const first = attempt(20, { puzzle: puzzle(20, 32) }, outcome);
      const later = attempt(21, { puzzle: first.puzzle });
      expect(result([...wins(9), first, later]).countsTowardUnlock).toBe(false);
    }
  });
  it("counts a resumed first solve once, without counting paused wall time", () => {
    const records = projectRecords(resumed());
    expect(result(records)).toMatchObject({
      countsTowardUnlock: true,
      hintFreeSolvesAtLevel: 1,
      levelSolvedDistinct: 1,
    });
    expect(records[0].effectiveMs).toBe(1234);
  });
  it("reports L8 distinct boards and never opens L9", () => {
    const history = [32, 45, 56, 65, 70, 85].flatMap((rating, i) => wins(10, rating, i * 10 + 1));
    expect(result(history, undefined, 8)).toMatchObject({
      level: 8,
      justUnlockedLevel: null,
      levelSolvedDistinct: 10,
    });
  });
  it("rejects missing, unfinished, revealed and mixed-player inputs", () => {
    expect(() => solveResult([], "missing", { previousMaxOpenLevel: 3 })).toThrow(/completed/);
    for (const outcome of /** @type {const} */ (["pause", "reveal", "give_up"]))
      expect(() => result([attempt(1, {}, outcome)])).toThrow(/completed/);
    expect(() => result([attempt(1), attempt(2, { playerId: "other" })])).toThrow(/one player/);
  });
});

describe("level list and real manual Next", () => {
  it("returns fixed positions and empty totals for an empty level", async () => {
    const { catalog } = await openCatalog(catalogWith([10]));
    expect(levelList(catalog, [], 2, { playerId: "player" })).toEqual({
      items: [],
      nextIndex: null,
      totals: { total: 0, solved: 0, inProgress: 0 },
    });
    const list = levelList(catalog, [], 1, { playerId: "player" });
    expect(list.items[0]).toMatchObject({
      state: "unsolved",
      index: 1,
      solvedAt: null,
      solveMs: null,
    });
    expect(list.nextIndex).toBe(1);
  });
  it("shows ANY completed board across modes and catalog versions, including hints", async () => {
    const { catalog } = await openCatalog(catalogWith([32, 32, 32]));
    const history = catalog.puzzles.map((p, i) =>
      attempt(
        i + 1,
        {
          puzzle: p,
          mode: /** @type {const} */ (["easy", "medium", "hard"])[i],
          catalogVersion: "older",
        },
        i === 1 ? "hint" : "complete"
      )
    );
    const list = levelList(catalog, history, 3, { playerId: "player" });
    expect(list.items.every((item) => item.state === "solved")).toBe(true);
    expect(list.totals).toEqual({ total: 3, solved: 3, inProgress: 0 });
    expect(list.nextIndex).toBe(1);
  });
  it("retains the saved solve through faster and slower replays", async () => {
    const { catalog } = await openCatalog(catalogWith([32]));
    const original = {
      ...attempt(1, { puzzle: catalog.puzzles[0] }, "hint"),
      effectiveMs: 420_000,
    };
    const fast = { ...attempt(2, { puzzle: original.puzzle, replay: true }), effectiveMs: 12_000 };
    const slow = { ...attempt(3, { puzzle: original.puzzle, replay: true }), effectiveMs: 900_000 };
    const active = attempt(4, { puzzle: original.puzzle, replay: true }, "pause");
    const history = [slow, active, fast, original];
    const list = levelList(catalog, history, 3, { playerId: "player" });
    expect(list.items[0]).toMatchObject({
      state: "replaying",
      solvedAt: original.endedAt,
      solveMs: 420_000,
      bestMs: 420_000,
    });
    expect(list.totals).toEqual({ total: 1, solved: 1, inProgress: 1 });
    expect(levelList(catalog, [fast, original], 3, { playerId: "player" }).items[0]).toMatchObject({
      state: "solved",
      solveMs: 420_000,
    });
  });
  it("allows a replay-only completion as solved, but not a revealed answer", async () => {
    const { catalog } = await openCatalog(catalogWith([10, 10]));
    const records = [
      attempt(1, { puzzle: catalog.puzzles[0], replay: true }),
      attempt(2, { puzzle: catalog.puzzles[1] }, "reveal"),
    ];
    expect(levelList(catalog, records, 1, { playerId: "player" }).totals.solved).toBe(1);
  });
  it("uses a stable completion tie break and ignores feedback update times", async () => {
    const { catalog } = await openCatalog(catalogWith([32]));
    const original = {
      ...attempt(1, { puzzle: catalog.puzzles[0] }),
      attemptId: "a",
      endedAt: 1000,
      updatedAt: 9999,
      effectiveMs: 500,
    };
    const replay = {
      ...attempt(2, { puzzle: original.puzzle, replay: true }),
      attemptId: "b",
      endedAt: 1000,
      effectiveMs: 100,
    };
    expect(levelList(catalog, [replay, original], 3, { playerId: "player" }).items[0].solveMs).toBe(
      500
    );
  });
  it("agrees with manual selection over several histories without changing order", async () => {
    const { catalog } = await openCatalog(catalogWith(Array(8).fill(32)));
    const order = fixedLevelOrder(catalog, 3);
    const all = order.map((p, i) => attempt(i + 1, { puzzle: p }));
    const paused = attempt(20, { puzzle: order[0] }, "pause");
    const replay = attempt(21, { puzzle: order[1], replay: true }, "pause");
    const histories = [
      [],
      [all[0]],
      [paused],
      [all[1], replay],
      all,
      [...all, replay],
      all.map((a) => ({ ...a, outcome: /** @type {const} */ ("paused") })),
    ];
    for (const history of histories) {
      const list = levelList(catalog, history, 3, { playerId: "player" });
      const selected = selectPuzzle({
        catalog,
        records: history,
        playerId: "player",
        mode: "manual",
        level: 3,
        seed: "different",
      });
      expect(list.items.map((item) => item.puzzle.id)).toEqual(order.map((p) => p.id));
      expect(list.nextIndex === null ? null : list.items[list.nextIndex - 1].puzzle.id).toBe(
        selected.puzzleId
      );
    }
  });
  it("matches exact digits or ID without treating similar boards as the same", async () => {
    const { catalog } = await openCatalog(catalogWith([32, 32]));
    const a = attempt(1, { puzzle: catalog.puzzles[0] });
    for (const changed of [
      { ...a.puzzle, id: "old-id" },
      { ...a.puzzle, digits: puzzle(99, 32).digits },
    ]) {
      expect(
        levelList(catalog, [{ ...a, puzzle: changed }], 3, { playerId: "player" }).totals.solved
      ).toBe(1);
    }
  });
  it("rejects unverified catalogs and mixed or mismatched players", async () => {
    const raw = catalogWith([10]);
    expect(() => levelList(raw, [], 1, { playerId: "player" })).toThrow();
    const { catalog } = await openCatalog(raw);
    for (const history of [
      [attempt(1, { playerId: "other" })],
      [attempt(1), attempt(2, { playerId: "other" })],
    ])
      expect(() => levelList(catalog, history, 1, { playerId: "player" })).toThrow(/one player/);
  });
});

describe("unfinished bank attempts", () => {
  it("returns zero for empty input and excludes terminal attempts", () => {
    expect(unfinishedList([])).toEqual({ count: 0, items: [] });
    expect(
      unfinishedList([
        attempt(1),
        attempt(2, {}, "hint"),
        attempt(3, {}, "reveal"),
        attempt(4, {}, "give_up"),
      ]).count
    ).toBe(0);
  });
  it("lists all bank modes newest first, including snapshotless replay attempts", () => {
    const modes = /** @type {const} */ (["easy", "medium", "hard", "manual", "sequential"]);
    const records = modes.map((mode, i) => attempt(i + 1, { mode, replay: i === 4 }, "pause"));
    const list = unfinishedList(records);
    expect(list.count).toBe(5);
    expect(list.items.map((a) => a.mode)).toEqual([...modes].reverse());
    expect(list.items[0]).toEqual({
      attemptId: "attempt-5",
      startedAt: 500,
      updatedAt: 501,
      mode: "sequential",
      level: 1,
      effectiveMs: 0,
      replay: true,
    });
  });
  it("follows pause, resume and complete within one attempt", () => {
    const log = resumed();
    const paused = unfinishedList(projectRecords({ ...log, events: log.events.slice(0, 3) }));
    const active = unfinishedList(projectRecords({ ...log, events: log.events.slice(0, 4) }));
    expect(paused.items[0]).toMatchObject({ effectiveMs: 1234, updatedAt: 102 });
    expect(active.items[0]).toMatchObject({ effectiveMs: 1234, updatedAt: 200 });
    expect(unfinishedList(projectRecords(log)).count).toBe(0);
  });
  it("breaks activity ties by ID and rejects mixed players", () => {
    const a = attempt(1, {}, "pause"),
      b = { ...attempt(2, {}, "pause"), updatedAt: a.updatedAt };
    expect(unfinishedList([b, a]).items.map((a) => a.attemptId)).toEqual([
      a.attemptId,
      b.attemptId,
    ]);
    expect(() => unfinishedList([a, { ...b, playerId: "other" }])).toThrow(/one player/);
  });
});

/** @param {string} iso @param {number} [number] @param {Partial<import("./types.js").Start>} [overrides]
 * @param {Parameters<typeof attempt>[2]} [outcome] */
function onDay(iso, number = 1, overrides = {}, outcome = "complete") {
  const at = Date.parse(iso);
  return {
    ...attempt(number, overrides, outcome),
    startedAt: at - 100,
    endedAt: at,
    updatedAt: at,
  };
}

describe("local calendar day streak", () => {
  const now = Date.parse("2026-11-11T12:00:00+08:00");
  const options = { now, timeZone: "Asia/Taipei" };
  it("returns zero for empty history", () => {
    expect(dayStreak([], options)).toEqual({ current: 0, longest: 0, todayDone: false });
  });
  it("counts hinted E/M/H completes once per day and allows yesterday as the end", () => {
    const records = [
      onDay("2026-11-09T23:59:00+08:00", 1, { mode: "easy" }),
      onDay("2026-11-10T00:01:00+08:00", 2, { mode: "hard" }, "hint"),
      onDay("2026-11-10T01:00:00+08:00", 3),
    ];
    expect(dayStreak(records, options)).toEqual({ current: 2, longest: 2, todayDone: false });
    records.push(onDay("2026-11-11T00:00:00+08:00", 4));
    expect(dayStreak(records, options)).toEqual({ current: 3, longest: 3, todayDone: true });
  });
  it("breaks current only after a full missed day, retaining the historical longest", () => {
    const records = [onDay("2026-11-08T12:00:00+08:00"), onDay("2026-11-09T12:00:00+08:00", 2)];
    expect(dayStreak(records, options)).toEqual({ current: 0, longest: 2, todayDone: false });
  });
  it("ignores manual, sequential, replay, revealed, unfinished, and future events", () => {
    const records = [
      onDay("2026-11-11T10:00:00+08:00", 1, { mode: "manual" }),
      onDay("2026-11-11T10:00:00+08:00", 2, { mode: "sequential" }),
      onDay("2026-11-11T10:00:00+08:00", 3, { replay: true }),
      onDay("2026-11-11T10:00:00+08:00", 4, {}, "reveal"),
      onDay("2026-11-11T10:00:00+08:00", 5, {}, "pause"),
      onDay("2026-11-11T13:00:00+08:00", 6),
      onDay("2026-11-12T10:00:00+08:00", 7),
    ];
    expect(dayStreak(records, options)).toEqual({ current: 0, longest: 0, todayDone: false });
  });
  it.each([
    [
      "spring",
      ["2026-03-07T23:30:00-05:00", "2026-03-08T23:30:00-04:00", "2026-03-09T00:01:00-04:00"],
      "2026-03-09T12:00:00-04:00",
    ],
    [
      "fall",
      [
        "2026-10-31T23:30:00-04:00",
        "2026-11-01T01:30:00-04:00",
        "2026-11-01T01:30:00-05:00",
        "2026-11-02T00:01:00-05:00",
      ],
      "2026-11-02T12:00:00-05:00",
    ],
  ])("counts calendar days through %s DST changes", (_name, dates, current) => {
    const history = dates.map((date, i) => onDay(date, i + 1));
    expect(dayStreak(history, { now: Date.parse(current), timeZone: "America/New_York" })).toEqual({
      current: 3,
      longest: 3,
      todayDone: true,
    });
  });
  it("handles year and leap-day boundaries in Taipei", () => {
    for (const dates of [
      ["2024-02-28", "2024-02-29", "2024-03-01"],
      ["2025-12-30", "2025-12-31", "2026-01-01"],
    ]) {
      const records = dates.map((date, i) => onDay(`${date}T10:00:00+08:00`, i + 1));
      expect(
        dayStreak(records, { now: records.at(-1).endedAt, timeZone: "Asia/Taipei" }).current
      ).toBe(3);
    }
  });
  it("defaults to the device timezone and uses endedAt rather than later feedback", () => {
    const record = { ...onDay("2026-11-09T12:00:00Z"), updatedAt: now };
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(dayStreak([record], { now })).toEqual(dayStreak([record], { now, timeZone }));
    expect(dayStreak([record], options).todayDone).toBe(false);
  });
  it("rejects mixed players and invalid clock input", () => {
    expect(() => dayStreak([attempt(1), attempt(2, { playerId: "other" })], options)).toThrow(
      /one player/
    );
    expect(() => dayStreak([], { now: NaN })).toThrow(/timestamp/);
    expect(() => dayStreak([], { now, timeZone: "unknown" })).toThrow();
  });
});

it("selectors preserve caller input and do not access storage or the clock", async () => {
  const { catalog } = await openCatalog(catalogWith([32]));
  const records = [attempt(1, { puzzle: catalog.puzzles[0] })];
  const before = structuredClone(records);
  const clock = vi.spyOn(Date, "now").mockImplementation(() => {
    throw new Error("global clock read");
  });
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("storage read");
    },
    setItem: () => {
      throw new Error("storage write");
    },
  });
  try {
    result(records);
    levelList(catalog, records, 3, { playerId: "player" });
    unfinishedList(records);
    dayStreak(records, { now: 1000, timeZone: "Asia/Taipei" });
    expect(records).toEqual(before);
  } finally {
    clock.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("streak counts a resumed completion only when it has ended", () => {
  const log = resumed();
  const options = { now: 1000, timeZone: "Asia/Taipei" };
  expect(dayStreak(projectRecords({ ...log, events: log.events.slice(0, 4) }), options)).toEqual({
    current: 0,
    longest: 0,
    todayDone: false,
  });
  expect(dayStreak(projectRecords(log), options)).toEqual({
    current: 1,
    longest: 1,
    todayDone: true,
  });
});

it("keeps Custom out of bank unfinished counts and streaks", () => {
  const custom = {
    ...attempt(1, {}, "pause"),
    mode: /** @type {import("./types.js").Mode} */ ("custom"),
  };
  expect(unfinishedList([custom]).count).toBe(0);
  expect(
    dayStreak([{ ...custom, outcome: "independent_complete", endedAt: 200 }], {
      now: 1000,
      timeZone: "Asia/Taipei",
    }).current
  ).toBe(0);
});

it("solve-result credit agrees with unlock across a complete frontier history", () => {
  const history = [32, 45, 56, 65, 70, 85].flatMap((rating, i) => wins(12, rating, i * 20 + 1));
  for (let i = 0; i < history.length; i++) {
    const before = deriveUnlockState(history.slice(0, i));
    const through = history.slice(0, i + 1);
    const after = deriveUnlockState(through);
    const target = history[i],
      level = target.puzzle.level;
    const output = result(history, target, before.maxOpenLevel);
    expect(output.countsTowardUnlock).toBe(
      after.perLevel[level].hintFreeSolves > before.perLevel[level].hintFreeSolves
    );
    expect(output.justUnlockedLevel).toBe(
      after.maxOpenLevel > before.maxOpenLevel ? after.maxOpenLevel : null
    );
  }
});
