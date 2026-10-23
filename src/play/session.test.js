import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { timerRunning } from "../store.js";
import { createPlay, RESUME_HOLD_MS, RESUME_REVEAL_MS, RESUME_SHORT_MS } from "./session.svelte.js";

describe("play session", () => {
  /** @type {number} */
  let time;
  /** @type {ReturnType<typeof createPlay>} */
  let play;
  /** @type {number[]} */
  let lones;

  beforeEach(() => {
    time = 0;
    lones = [2, 5];
    timerRunning.set(true);
    play = createPlay({ live: false, idleMs: 30_000, now: () => time });
    play.bindLones(() => lones);
    play.start();
  });

  it("pulses every lone candidate together, and a cell that becomes lone joins the next pulse", () => {
    time = 30_000;
    play.step();
    expect(play.phase).toBe("flash");
    expect(play.showsCue(2)).toBe(true);
    expect(play.showsCue(5)).toBe(true);
    expect(play.showsCue(9)).toBe(false);

    lones = [2, 5, 9];
    time = 31_000;
    play.step();
    expect(play.showsCue(9)).toBe(false);

    time = 30_000 + 1_500;
    play.step();
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);

    time = 60_000;
    play.step();
    expect(play.phase).toBe("flash");
    expect(play.showsCue(2)).toBe(true);
    expect(play.showsCue(5)).toBe(true);
    expect(play.showsCue(9)).toBe(true);
  });

  it("resets the countdown on a board change and ends a pulse that is showing", () => {
    time = 20_000;
    play.noteActivity();
    time = 49_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 50_000;
    play.step();
    expect(play.phase).toBe("flash");
    time = 51_000;
    play.noteActivity();
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);
  });

  it("suppresses the cue while paused or a dialog is open, then starts over", () => {
    time = 10_000;
    expect(play.pause()).toBe(true);
    time = 80_000;
    play.step();
    expect(play.phase).toBe("idle");
    time = 90_000;
    expect(play.resume()).toBe(true);
    time = 119_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 120_000;
    play.step();
    expect(play.phase).toBe("flash");

    time = 121_000;
    play.openOptions();
    expect(play.modal).toBe("options");
    expect(play.phase).toBe("idle");
    time = 200_000;
    play.step();
    expect(play.showsCue(2)).toBe(false);
    time = 201_000;
    play.openConfirm();
    expect(play.modal).toBe("confirm");
    time = 250_000;
    play.step();
    expect(play.phase).toBe("idle");
    time = 260_000;
    play.closeModal();
    expect(play.modal).toBe(null);
    time = 289_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = 290_000;
    play.step();
    expect(play.phase).toBe("flash");
  });

  it("disables the cue in Manual and keeps the preference", () => {
    expect(play.switchChecked).toBe(true);
    expect(play.cuePref).toBe(true);
    play.setAuto(false);
    expect(play.switchDisabled).toBe(true);
    expect(play.switchChecked).toBe(false);
    expect(play.cueReason).toBe(true);
    expect(play.cuePref).toBe(true);
    time = 60_000;
    play.step();
    expect(play.phase).toBe("idle");
    play.setAuto(true);
    expect(play.switchChecked).toBe(true);
    expect(play.switchDisabled).toBe(false);
  });

  it("stays idle once the puzzle is solved until a new puzzle", () => {
    time = 30_000;
    play.step();
    expect(play.phase).toBe("flash");
    play.setSolved(true);
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);
    time = 90_000;
    play.step();
    expect(play.phase).toBe("idle");

    play.pause();
    expect(play.resume()).toBe(true);
    time = 120_000;
    play.step();
    expect(play.phase).toBe("idle");

    time = 121_000;
    play.setSolved(false);
    time = 151_000;
    play.step();
    expect(play.phase).toBe("flash");

    play.setSolved(true);
    time = 122_000;
    play.resetForLoad();
    time = 152_000;
    play.step();
    expect(play.phase).toBe("flash");
  });

  it("shows a static tint under reduced motion until the next input", () => {
    play.setReduced(true);
    time = 30_000;
    play.step();
    expect(play.phase).toBe("hold");
    expect(play.showsCue(2)).toBe(true);
    expect(play.showsCue(5)).toBe(true);
    time = 90_000;
    play.step();
    expect(play.phase).toBe("hold");
    time = 91_000;
    play.noteActivity();
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);
  });

  it("keeps legacy tap-to-fill off until the player turns it on", () => {
    expect(play.tapFill).toBe(false);
    play.toggleTapFill();
    expect(play.tapFill).toBe(true);
    play.toggleTapFill();
    expect(play.tapFill).toBe(false);
  });

  it("pauses on hide and auto-resumes after the reveal", () => {
    expect(get(timerRunning)).toBe(true);
    expect(play.noteHidden()).toBe(true);
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("auto");
    expect(get(timerRunning)).toBe(false);
    play.noteHidden();
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("auto");

    time = 5_000;
    expect(play.noteVisible(5_000)).toBe("hold");
    expect(play.resumePhase).toBe("hold");
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);

    time = 5_000 + RESUME_HOLD_MS;
    play.step();
    expect(play.resumePhase).toBe("reveal");
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);

    time = 5_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.resumePhase).toBe("idle");
    expect(play.paused).toBe(false);
    expect(play.reason).toBe(null);
    expect(get(timerRunning)).toBe(true);
  });

  it.each([200, 1_000])("gives a late hold callback a full reveal (%i ms late)", (late) => {
    play.noteHidden();
    time = 5_000;
    play.noteVisible(5_000);
    time += RESUME_HOLD_MS + late;
    play.step();
    expect(play.resumePhase).toBe("reveal");
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);
    time += RESUME_REVEAL_MS - 1;
    play.step();
    expect(play.paused).toBe(true);
    time += 1;
    play.step();
    expect(play.paused).toBe(false);
  });

  it.each(["hold", "reveal"])("rearms an early live callback during %s", (phase) => {
    vi.useFakeTimers();
    try {
      time = 10_000;
      const live = createPlay({ now: () => time });
      const resumed = vi.fn();
      live.onAutoResume(resumed);
      live.noteHidden();
      live.noteVisible(2_000);
      if (phase === "reveal") {
        time += RESUME_HOLD_MS;
        vi.advanceTimersByTime(RESUME_HOLD_MS);
      }
      time -= 100;
      vi.advanceTimersByTime(phase === "hold" ? RESUME_HOLD_MS : RESUME_REVEAL_MS);
      expect(live.resumePhase).toBe(phase);
      expect(get(timerRunning)).toBe(false);
      time = 20_000;
      vi.advanceTimersByTime(RESUME_REVEAL_MS + 100);
      if (phase === "hold") {
        expect(live.resumePhase).toBe("reveal");
        time += RESUME_REVEAL_MS;
        vi.advanceTimersByTime(RESUME_REVEAL_MS);
      }
      expect(live.paused).toBe(false);
      expect(resumed).toHaveBeenCalledExactlyOnceWith({ announce: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses monotonic time for live resume when wall time moves backward", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(10_000);
      const live = createPlay();
      live.noteHidden();
      live.noteVisible(2_000);
      vi.setSystemTime(9_900);
      vi.advanceTimersByTime(RESUME_HOLD_MS);
      expect(live.resumePhase).toBe("reveal");
      vi.setSystemTime(0);
      vi.advanceTimersByTime(RESUME_REVEAL_MS);
      expect(live.paused).toBe(false);
      expect(get(timerRunning)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for the actual animation after the reveal deadline", async () => {
    let complete = () => {};
    const animation = new Promise((resolve) => {
      complete = () => resolve(undefined);
    });
    play.bindRevealCompletion(() => animation);
    const resumed = vi.fn();
    play.onAutoResume(resumed);
    play.noteHidden();
    play.noteVisible(2_000);
    time += RESUME_HOLD_MS;
    play.step();
    time += RESUME_REVEAL_MS;
    play.step();
    expect(play.resumePhase).toBe("reveal");
    expect(get(timerRunning)).toBe(false);
    complete();
    await animation;
    expect(play.paused).toBe(false);
    expect(resumed).toHaveBeenCalledExactlyOnceWith({ announce: true });
  });

  it.each([false, true])(
    "bounds the wait for an unfinished animation (rejected: %s)",
    async (reject) => {
      vi.useFakeTimers();
      try {
        const live = createPlay();
        live.bindRevealCompletion(() =>
          reject ? Promise.reject(new Error("cancelled")) : new Promise(() => {})
        );
        live.noteHidden();
        live.noteVisible(2_000);
        await vi.advanceTimersByTimeAsync(RESUME_HOLD_MS + RESUME_REVEAL_MS);
        expect(live.paused).toBe(true);
        await vi.advanceTimersByTimeAsync(999);
        expect(live.paused).toBe(true);
        await vi.advanceTimersByTimeAsync(1);
        expect(live.paused).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it("ignores completion from a reveal cancelled by another hide", async () => {
    let complete = () => {};
    const animation = new Promise((resolve) => {
      complete = () => resolve(undefined);
    });
    play.bindRevealCompletion(() => animation);
    play.noteHidden();
    play.noteVisible(2_000);
    time += RESUME_HOLD_MS;
    play.step();
    time += RESUME_REVEAL_MS;
    play.step();
    play.noteHidden();
    play.noteVisible(2_000);
    time += RESUME_HOLD_MS;
    play.step();
    complete();
    await animation;
    expect(play.resumePhase).toBe("reveal");
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);
  });

  it("keeps a manual pause paused when the page returns", () => {
    expect(play.pause()).toBe(true);
    expect(play.reason).toBe("manual");
    expect(play.noteHidden()).toBe(false);
    expect(play.reason).toBe("manual");
    expect(play.paused).toBe(true);
    time = 8_000;
    expect(play.noteVisible(8_000)).toBe("stayed");
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("manual");
    expect(get(timerRunning)).toBe(false);
    expect(play.resume()).toBe(true);
    expect(play.reason).toBe(null);
    expect(play.paused).toBe(false);
  });

  it("resumes instantly and quietly after an absence under 1s", () => {
    play.noteHidden();
    time = RESUME_SHORT_MS - 1;
    expect(play.noteVisible(RESUME_SHORT_MS - 1)).toBe("quiet");
    expect(play.paused).toBe(false);
    expect(play.resumePhase).toBe("idle");
    expect(play.reason).toBe(null);
    expect(get(timerRunning)).toBe(true);

    play.noteHidden();
    time = RESUME_SHORT_MS;
    expect(play.noteVisible(RESUME_SHORT_MS)).toBe("hold");
    expect(play.paused).toBe(true);
  });

  it("resumes instantly under reduced motion and still announces", () => {
    play.setReduced(true);
    play.noteHidden();
    time = 20_000;
    expect(play.noteVisible(20_000)).toBe("announced");
    expect(play.paused).toBe(false);
    expect(play.resumePhase).toBe("idle");
    expect(get(timerRunning)).toBe(true);
  });

  it("keeps the clock and the cue blocked until the reveal ends", () => {
    time = 29_000;
    play.step();
    expect(play.phase).toBe("idle");
    play.noteHidden();
    time = 80_000;
    play.step();
    expect(play.phase).toBe("idle");
    expect(play.showsCue(2)).toBe(false);
    expect(play.noteVisible(50_000)).toBe("hold");
    time = 80_000 + RESUME_HOLD_MS;
    play.step();
    expect(play.resumePhase).toBe("reveal");
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);
    expect(play.phase).toBe("idle");
    time = 80_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS - 1;
    play.step();
    expect(play.paused).toBe(true);
    expect(play.phase).toBe("idle");
    time = 80_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.paused).toBe(false);
    expect(get(timerRunning)).toBe(true);
    const resumedAt = time;
    time = resumedAt + 29_999;
    play.step();
    expect(play.phase).toBe("idle");
    time = resumedAt + 30_000;
    play.step();
    expect(play.phase).toBe("flash");
    expect(play.showsCue(2)).toBe(true);
  });

  it("cancels a reveal when the page hides again, then starts over", () => {
    play.noteHidden();
    time = 2_000;
    play.noteVisible(2_000);
    time = 2_000 + RESUME_HOLD_MS + 40;
    play.step();
    expect(play.resumePhase).toBe("reveal");
    expect(play.noteHidden()).toBe(false);
    expect(play.resumePhase).toBe("idle");
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("auto");
    expect(get(timerRunning)).toBe(false);
    time = 9_000;
    expect(play.noteVisible(4_000)).toBe("hold");
    expect(play.resumePhase).toBe("hold");
    time = 9_000 + RESUME_HOLD_MS;
    play.step();
    time = 9_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.paused).toBe(false);
  });

  it("ignores Resume and P while the page is hidden", () => {
    expect(play.noteHidden()).toBe(true);
    time = 4_000;
    expect(play.resume()).toBe(false);
    expect(play.toggle()).toBe("ignored");
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("auto");
    expect(play.resumePhase).toBe("idle");
    expect(get(timerRunning)).toBe(false);
    time = 9_000;
    play.step();
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("auto");
    expect(get(timerRunning)).toBe(false);

    expect(play.noteVisible(9_000)).toBe("hold");
    expect(play.resume()).toBe(true);
    expect(play.paused).toBe(false);
    expect(get(timerRunning)).toBe(true);

    expect(play.pause()).toBe(true);
    expect(play.noteHidden()).toBe(false);
    time = 15_000;
    expect(play.resume()).toBe(false);
    expect(play.toggle()).toBe("ignored");
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("manual");
    expect(get(timerRunning)).toBe(false);
    time = 20_000;
    play.step();
    expect(play.paused).toBe(true);
    expect(play.reason).toBe("manual");
    expect(get(timerRunning)).toBe(false);
    expect(play.noteVisible(5_000)).toBe("stayed");
    expect(play.resume()).toBe(true);
    expect(get(timerRunning)).toBe(true);
  });

  it("resumes at once when Resume or P cancels the hold", () => {
    play.noteHidden();
    time = 2_000;
    play.noteVisible(2_000);
    expect(play.resumePhase).toBe("hold");
    expect(play.resume()).toBe(true);
    expect(play.resumePhase).toBe("idle");
    expect(play.paused).toBe(false);
    time = 20_000;
    play.step();
    expect(play.paused).toBe(false);
    expect(get(timerRunning)).toBe(true);
  });

  it("does not auto-pause a solved board", () => {
    play.setSolved(true);
    expect(play.noteHidden()).toBe(false);
    expect(play.paused).toBe(false);
    expect(play.reason).toBe(null);
    expect(get(timerRunning)).toBe(true);
    expect(play.noteVisible(5_000)).toBe("stayed");
  });

  it("closes Options or Restart on hide and does not reopen them", () => {
    play.openOptions();
    expect(play.noteHidden()).toBe(true);
    expect(play.modal).toBe(null);
    expect(play.reason).toBe("auto");
    time = 3_000;
    play.noteVisible(3_000);
    time = 3_000 + RESUME_HOLD_MS;
    play.step();
    time = 3_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.paused).toBe(false);
    expect(play.modal).toBe(null);

    play.openOptions();
    play.openConfirm();
    expect(play.modal).toBe("confirm");
    play.noteHidden();
    expect(play.modal).toBe(null);
    expect(play.reason).toBe("auto");
    time = 8_000;
    expect(play.noteVisible(4_000, { silent: false })).toBe("hold");
    time = 8_000 + RESUME_HOLD_MS;
    play.step();
    time = 8_000 + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.modal).toBe(null);
    expect(play.paused).toBe(false);
  });

  it("resumes silently when the board is not on screen", () => {
    play.noteHidden();
    time = 12_000;
    expect(play.noteVisible(12_000, { silent: true })).toBe("quiet");
    expect(play.paused).toBe(false);
    expect(play.resumePhase).toBe("idle");
    expect(play.reason).toBe(null);
    expect(get(timerRunning)).toBe(true);
  });

  it("auto-resumes with no limit on how long the page was hidden", () => {
    play.noteHidden();
    const away = 3 * 24 * 60 * 60 * 1000;
    time = away;
    expect(play.noteVisible(away)).toBe("hold");
    time = away + RESUME_HOLD_MS;
    play.step();
    time = away + RESUME_HOLD_MS + RESUME_REVEAL_MS;
    play.step();
    expect(play.paused).toBe(false);
    expect(get(timerRunning)).toBe(true);
  });

  it("runs the hold and reveal on timers when live", () => {
    vi.useFakeTimers();
    try {
      timerRunning.set(true);
      const live = createPlay({ live: true, idleMs: 30_000, now: () => Date.now() });
      live.bindLones(() => [2]);
      live.start();
      /** @type {string[]} */
      const heard = [];
      live.onAutoResume((info) => {
        heard.push(info.announce ? "Resumed" : "");
      });
      expect(live.noteHidden()).toBe(true);
      expect(live.noteVisible(2_000)).toBe("hold");
      vi.advanceTimersByTime(RESUME_HOLD_MS - 1);
      expect(live.resumePhase).toBe("hold");
      expect(live.paused).toBe(true);
      expect(get(timerRunning)).toBe(false);
      vi.advanceTimersByTime(1);
      expect(live.resumePhase).toBe("reveal");
      expect(live.paused).toBe(true);
      vi.advanceTimersByTime(RESUME_REVEAL_MS - 1);
      expect(live.paused).toBe(true);
      expect(heard).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(live.paused).toBe(false);
      expect(live.reason).toBe(null);
      expect(get(timerRunning)).toBe(true);
      expect(heard).toEqual(["Resumed"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores the pause toggle while a dialog is open", () => {
    play.openOptions();
    expect(play.toggle()).toBe("ignored");
    expect(play.paused).toBe(false);
    expect(play.modal).toBe("options");
  });

  it("closes an open dialog when the tab hides", () => {
    play.openOptions();
    play.noteHidden();
    expect(play.paused).toBe(true);
    expect(play.modal).toBe(null);
  });

  it("sends Cancel back to the sheet and Restart focus", () => {
    play.openOptions();
    expect(play.focus).toBe("cue");
    play.openConfirm();
    play.backToOptions();
    expect(play.modal).toBe("options");
    expect(play.focus).toBe("restart");
  });
});

it("keeps preferences usable when the localStorage getter throws", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    },
  });
  try {
    expect(() => {
      const play = createPlay({ live: false });
      play.toggleCue();
      play.toggleTapFill();
    }).not.toThrow();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
