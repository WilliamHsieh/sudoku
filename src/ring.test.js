import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDeferredAction } from "./ring.js";

describe("createDeferredAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("destroy applies an in-flight action immediately and the timer does not fire later", () => {
    const d = createDeferredAction();
    let n = 0;
    d.schedule(() => {
      n += 1;
    }, 800);
    expect(d.isPending).toBe(true);
    d.destroy();
    expect(n).toBe(1);
    expect(d.isPending).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(n).toBe(1);
  });

  it("flush applies now; a second destroy is a no-op", () => {
    const d = createDeferredAction();
    let n = 0;
    d.schedule(() => {
      n += 1;
    }, 400);
    d.flush();
    expect(n).toBe(1);
    d.destroy();
    vi.advanceTimersByTime(400);
    expect(n).toBe(1);
  });

  it("a new schedule flushes the previous one first", () => {
    const d = createDeferredAction();
    const order = [];
    d.schedule(() => order.push("a"), 500);
    d.schedule(() => order.push("b"), 500);
    expect(order).toEqual(["a"]);
    vi.advanceTimersByTime(500);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("ring feedback cleanup for hints", () => {
  it("finishes a pending undo exactly once, cancels cosmetics, and keeps later redo bound", async () => {
    vi.useFakeTimers();
    const { createRingController } = await import("./ring.js");
    const { game } = await import("./game/game.svelte.js");
    const { padUi } = await import("./pad-ui.svelte.js");
    const { setAnswer } = await import("./game/game.js");
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    game.load("0".repeat(81));
    game.commitStroke(setAnswer(game.state, 0, 1).state);
    const cancel = vi.fn();
    const animate = vi.fn();
    const remove = vi.fn();
    const rect = () => ({ left: 0, top: 0, width: 40, height: 40 });
    const feedback = createRingController();
    feedback.bind(
      {
        querySelector: (selector) =>
          selector === ".board" ? { classList: { remove } } : { getBoundingClientRect: rect },
        getBoundingClientRect: rect,
      },
      { getAnimations: () => [{ cancel }], animate, style: {} }
    );
    feedback.undo();
    expect(game.value(0)).toBe(1);
    expect(animate).toHaveBeenCalledTimes(1);
    feedback.clearFeedback();
    expect(game.value(0)).toBe(0);
    expect(cancel).toHaveBeenCalled();
    expect(padUi.undoTargets).toEqual([]);
    expect(padUi.quiet).toBe(false);
    feedback.clearFeedback();
    vi.runAllTimers();
    expect(game.value(0)).toBe(0);
    expect(game.canRedo).toBe(true);
    feedback.redo();
    expect(animate).toHaveBeenCalledTimes(2);
    feedback.clearFeedback();
    expect(game.value(0)).toBe(1);
    feedback.destroy();
    vi.runAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
