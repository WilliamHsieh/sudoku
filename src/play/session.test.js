import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { timerRunning } from "../store.js";
import { createPlay } from "./session.svelte.js";

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

  it("resets the countdown when the player selects a cell", () => {
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

  it("pauses on hide and does not auto-resume", () => {
    expect(get(timerRunning)).toBe(true);
    play.noteHidden();
    expect(play.paused).toBe(true);
    expect(get(timerRunning)).toBe(false);
    play.noteHidden();
    expect(play.paused).toBe(true);
    expect(play.toggle()).toBe("resumed");
    expect(play.paused).toBe(false);
    expect(get(timerRunning)).toBe(true);
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
