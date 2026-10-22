import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { createGame } from "./game/game.svelte.js";
import { createPlay, RESUME_HOLD_MS, RESUME_REVEAL_MS } from "./play/session.svelte.js";
import { attachElapsedTimer, done, resetTimer, timer, timerRunning } from "./store.js";

/**
 * Run 2.7s, pause for 5s, then resume. The displayed second waits out the
 * 0.3s still left in that running second, and the pause is not counted.
 * @param {() => void} pause
 * @param {() => void} resume leaves the clock running
 */
function expectGapSkipped(pause, resume) {
  vi.advanceTimersByTime(2_700);
  expect(get(timer)).toBe(2);

  pause();
  expect(get(timerRunning)).toBe(false);
  vi.advanceTimersByTime(5_000);
  expect(get(timer)).toBe(2);

  resume();
  expect(get(timerRunning)).toBe(true);
  expect(get(timer)).toBe(2);
  vi.advanceTimersByTime(299);
  expect(get(timer)).toBe(2);
  vi.advanceTimersByTime(1);
  expect(get(timer)).toBe(3);
}

describe("elapsed timer", () => {
  /** @type {(() => void) | undefined} */
  let detach;

  beforeEach(() => {
    vi.useFakeTimers();
    done.set(false);
    resetTimer();
    detach = attachElapsedTimer();
  });

  afterEach(() => {
    detach?.();
    detach = undefined;
    resetTimer();
    done.set(false);
    vi.useRealTimers();
  });

  it("a manual pause resumes on the remainder and skips the gap", () => {
    const play = createPlay({ live: false, now: () => Date.now() });
    expectGapSkipped(
      () => {
        expect(play.pause()).toBe(true);
      },
      () => {
        expect(play.resume()).toBe(true);
      }
    );
  });

  it("an automatic pause on hide resumes on the remainder after the reveal", () => {
    const play = createPlay({ live: true, now: () => Date.now() });
    play.bindLones(() => []);
    play.start();

    vi.advanceTimersByTime(2_700);
    expect(get(timer)).toBe(2);

    expect(play.noteHidden()).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(get(timer)).toBe(2);
    expect(get(timerRunning)).toBe(false);

    expect(play.noteVisible(5_000)).toBe("hold");
    vi.advanceTimersByTime(RESUME_HOLD_MS);
    expect(play.resumePhase).toBe("reveal");
    expect(get(timer)).toBe(2);
    vi.advanceTimersByTime(RESUME_REVEAL_MS - 1);
    expect(get(timerRunning)).toBe(false);
    expect(get(timer)).toBe(2);
    vi.advanceTimersByTime(1);
    expect(get(timerRunning)).toBe(true);
    expect(get(timer)).toBe(2);

    vi.advanceTimersByTime(299);
    expect(get(timer)).toBe(2);
    vi.advanceTimersByTime(1);
    expect(get(timer)).toBe(3);
  });

  it("Restart drops the partial second and the paused gap", () => {
    const play = createPlay({ live: false, now: () => Date.now() });
    const game = createGame();

    vi.advanceTimersByTime(2_700);
    expect(get(timer)).toBe(2);
    expect(play.pause()).toBe(true);
    vi.advanceTimersByTime(5_000);
    expect(get(timer)).toBe(2);

    game.restart();
    expect(get(timer)).toBe(0);
    expect(get(timerRunning)).toBe(true);
    vi.advanceTimersByTime(999);
    expect(get(timer)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(get(timer)).toBe(1);
  });
});
