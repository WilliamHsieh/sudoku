import { describe, it, expect, vi } from "vitest";
import { createGame } from "../game/game.svelte.js";
import { newGame, setAnswer, setNotesMode, hasCandidate } from "../game/game.js";
import { createHintSession } from "./session.svelte.js";
import { hintStateKey, hintSnapshot } from "./hint.js";
import { hintFixture } from "./fixtures.mjs";

function setup(name = "xwing") {
  const fixture = hintFixture(name);
  const game = createGame();
  game.load(fixture.state.givens.join(""));
  game.commitStroke(fixture.state);
  return { game, fixture, session: createHintSession({ game, provider: fixture.provider }) };
}

function gate() {
  let finish = () => {};
  const promise = new Promise((resolve) => {
    finish = () => resolve(null);
  });
  return { promise, finish: () => finish() };
}

describe("hint UI session", () => {
  it("reveals one proof progressively without editing notes, history or answers", async () => {
    const { game, session } = setup();
    const before = game.state;
    await session.open();
    expect(session.status).toBe("ready");
    expect(session.evidence(5)?.premise).toBe(false);
    session.next();
    expect(session.evidence(5)?.candidates).toEqual([1]);
    expect(session.evidence(24)).toBe(null);
    session.next();
    expect(session.evidence(24)?.eliminations).toEqual([1]);
    session.close();
    expect(game.state).toBe(before);
    expect(session.evidence(5)).toBe(null);
  });

  it("applies all three eliminations together and undoes exactly that step", async () => {
    const { game, session } = setup();
    const before = game.state;
    await session.open();
    session.next();
    session.next();
    session.apply();
    expect(session.status).toBe("applied");
    for (const i of [24, 60, 68]) expect(hasCandidate(game.state, i, 1)).toBe(false);
    session.undo();
    expect(game.state).toBe(before);
    expect(session.status).toBe("closed");
  });

  it("searches the new position when reopened after applying a hint", async () => {
    const { game, fixture } = setup();
    const provider = vi.fn(fixture.provider);
    const session = createHintSession({ game, provider });
    await session.open();
    session.next();
    session.next();
    session.apply();
    const appliedState = game.state;
    session.close();
    await session.open();
    expect(provider).toHaveBeenCalledTimes(2);
    expect(session.status).toBe("empty");
    expect(session.undoAvailable).toBe(false);
    expect(game.state).toBe(appliedState);
    // Closing the completed hint does not remove the normal game undo entry.
    game.undo();
    expect(hasCandidate(game.state, 24, 1)).toBe(true);
  });

  it("rejects a stale proof even if the reactive reconcile has not run yet", async () => {
    const { game, session } = setup();
    await session.open();
    session.next();
    session.next();
    game.enter(1, 3);
    const edited = game.state;
    session.apply();
    expect(session.status).toBe("stale");
    expect(game.state).toBe(edited);
    expect(hasCandidate(game.state, 24, 1)).toBe(true);
  });

  it("rejects duplicate placements without clearing an answer or adding history", async () => {
    const { game, fixture } = setup("hidden");
    const before = game.state;
    const session = createHintSession({
      game,
      provider: async () => ({
        ...fixture.hint,
        placements: [...fixture.hint.placements, ...fixture.hint.placements],
      }),
    });
    await session.open();
    session.next();
    session.next();
    session.apply();
    expect(session.status).toBe("error");
    expect(game.state).toBe(before);
    expect(game.value(0)).toBe(0);
  });

  it("never lets an old request overwrite a newer result, and aborts it on close", async () => {
    const { game, fixture } = setup();
    const old = gate();
    const signals = [];
    let call = 0;
    const provider = vi.fn(async (_state, { signal }) => {
      signals.push(signal);
      if (++call === 1) await old.promise;
      return fixture.hint;
    });
    const session = createHintSession({ game, provider });
    const first = session.open();
    session.close();
    expect(signals[0].aborted).toBe(true);
    await session.open();
    session.next();
    old.finish();
    await first;
    expect(session.stage).toBe(1);
    expect(session.status).toBe("ready");
  });

  it("discards asynchronous results after a board edit and releases work on pause/close", async () => {
    const { game, fixture } = setup();
    const wait = gate();
    /** @type {AbortSignal | undefined} */
    /** @type {AbortSignal | undefined} */
    let signal;
    const session = createHintSession({
      game,
      provider: async (_state, options) => {
        signal = options.signal;
        await wait.promise;
        return fixture.hint;
      },
    });
    const request = session.open();
    game.enter(1, 3);
    session.reconcile(game.state);
    expect(signal?.aborted).toBe(true);
    wait.finish();
    await request;
    expect(session.status).toBe("stale");
  });

  it("refuses to undo some other edit after a hint has been applied", async () => {
    const { game, session } = setup();
    await session.open();
    session.next();
    session.next();
    session.apply();
    game.enter(1, 3);
    const edited = game.state;
    session.undo();
    expect(game.state).toBe(edited);
    expect(session.status).toBe("stale");
  });

  it("shows unavailable, no-result and recoverable failure without fabricating a hint", async () => {
    const { game } = setup();
    const unavailable = createHintSession({ game });
    await unavailable.open();
    expect(unavailable.status).toBe("unavailable");
    const empty = createHintSession({ game, provider: async () => null });
    await empty.open();
    expect(empty.status).toBe("empty");
    const failure = createHintSession({
      game,
      provider: async () => {
        throw Error("offline");
      },
    });
    await failure.open();
    expect(failure.status).toBe("error");
  });

  it("preserves incomplete Tidy notes and still applies an unnoted placement", async () => {
    const { game, fixture } = setup("hidden");
    game.commitStroke(setNotesMode(game.state, "tidy"));
    const before = game.state;
    const session = createHintSession({ game, provider: async () => fixture.hint });
    await session.open();
    session.next();
    expect(session.evidence(0)?.mask).toBe(0);
    expect(session.evidence(11)?.excluded).toEqual([]);
    expect(game.state.manualNotes.every((m) => m === 0)).toBe(true);
    session.next();
    session.apply();
    expect(game.value(0)).toBe(7);
    session.undo();
    expect(game.state).toBe(before);
  });

  it("preserves visible Tidy marks even when they differ from the proof candidates", async () => {
    const { game, fixture } = setup("hidden");
    game.setNotesMode("tidy");
    const manualNotes = [...game.state.manualNotes];
    manualNotes[0] = 1 << 2;
    manualNotes[11] = 1 << 7;
    game.commitStroke({ ...game.state, manualNotes });
    const before = game.state;
    const session = createHintSession({ game, provider: async () => fixture.hint });
    await session.open();
    session.next();
    expect(session.evidence(0)?.mask).toBe(1 << 2);
    expect(session.evidence(11)?.excluded).toEqual([7]);
    expect(session.evidence(20)?.excluded).toEqual([]);
    session.next();
    expect(session.evidence(0)?.target).toBe(true);
    expect(session.evidence(0)?.mask).toBe(1 << 2);
    session.close();
    expect(game.state).toBe(before);
  });

  it("does not invoke a provider or open an unavailable panel in Manual mode", async () => {
    const { game, fixture } = setup();
    game.setNotesMode("manual");
    const provider = vi.fn(fixture.provider);
    const session = createHintSession({ game, provider });
    await session.open();
    expect(provider).not.toHaveBeenCalled();
    expect(session.isOpen).toBe(false);
    const unavailable = createHintSession({ game });
    await unavailable.open();
    expect(unavailable.isOpen).toBe(false);
  });

  it("closes and clears an open proof immediately on entering Manual", async () => {
    const { game, session } = setup();
    await session.open();
    session.next();
    session.next();
    game.setNotesMode("manual");
    const before = game.state;
    // Applying is guarded even before the component's reactive reconciliation.
    session.apply();
    session.reconcile(game.state);
    expect(session.status).toBe("closed");
    expect(session.hint).toBe(null);
    expect(session.stage).toBe(0);
    expect(session.evidence(5)).toBe(null);
    expect(session.undoAvailable).toBe(false);
    expect(game.state).toBe(before);
  });

  it("aborts a pending search on entering Manual and ignores a late result", async () => {
    const { game, fixture } = setup();
    const wait = gate();
    /** @type {AbortSignal | undefined} */
    let signal;
    const session = createHintSession({
      game,
      provider: async (_state, options) => {
        signal = options.signal;
        await wait.promise;
        return fixture.hint;
      },
    });
    const pending = session.open();
    game.setNotesMode("manual");
    session.reconcile(game.state);
    expect(signal?.aborted).toBe(true);
    wait.finish();
    await pending;
    expect(session.status).toBe("closed");
    expect(session.hint).toBe(null);
  });

  it("keeps visible Auto notes instead of resurrecting proof-mask digits", async () => {
    const { game, fixture } = setup();
    game.toggleNote(5, 1);
    const before = game.state;
    const session = createHintSession({ game, provider: async () => fixture.hint });
    await session.open();
    session.next();
    expect(session.evidence(5)?.mask).toBe(game.notes(5));
    expect(session.evidence(5)?.candidates).toEqual([]);
    session.close();
    expect(game.state).toBe(before);
  });

  it("does not create a phantom deletion or undo for absent Tidy notes", async () => {
    const { game, fixture } = setup("pair");
    game.setNotesMode("tidy");
    const before = game.state;
    const session = createHintSession({ game, provider: async () => fixture.hint });
    await session.open();
    session.next();
    session.next();
    expect(session.evidence(23)?.eliminations).toEqual([]);
    session.apply();
    expect(game.state).toBe(before);
    expect(session.status).toBe("applied");
    expect(session.didApply).toBe(false);
    expect(session.undoAvailable).toBe(false);
    session.undo();
    expect(game.state).toBe(before);
  });

  it("keys copies by puzzle, answers, notes and mode, but never selection/time", () => {
    const state = newGame("0".repeat(81));
    const copy = hintSnapshot(state);
    expect(hintStateKey(copy)).toBe(hintStateKey(state));
    expect(copy.answers).not.toBe(state.answers);
    expect(hintStateKey(setAnswer(state, 0, 1).state)).not.toBe(hintStateKey(state));
    expect(hintStateKey({ ...state, notesMode: "auto" })).not.toBe(hintStateKey(state));
  });
});

it("does not offer an inert undo button when a final hint completes the puzzle", async () => {
  const complete =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
  const { findHint } = await import("./engine.js");
  const { registerVerifiedHint } = await import("./certificates.js");
  const game = createGame();
  game.load("0" + complete.slice(1));
  game.setNotesMode("auto");
  const session = createHintSession({
    game,
    provider: async (state) => {
      const hint = findHint(state);
      registerVerifiedHint(hint, hintStateKey(state));
      return hint;
    },
  });
  await session.open();
  session.next();
  session.next();
  session.apply();
  expect(game.solved).toBe(true);
  expect(session.status).toBe("applied");
  expect(session.didApply).toBe(true);
  expect(session.undoAvailable).toBe(false);
});
