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
