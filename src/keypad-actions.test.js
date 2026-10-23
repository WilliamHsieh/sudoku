import { afterEach, describe, expect, it, vi } from "vitest";
import { game } from "./game/game.svelte.js";
import { padUi } from "./pad-ui.svelte.js";
import { createPlay } from "./play/session.svelte.js";
import {
  clearKeypadSelection,
  finishDigitTap,
  focusedDigit,
  lastKeyPress,
  lockDigit,
  lockTap,
  resetKeypad,
  showDigit,
  syncHighlightAfterEdit,
  unlockKeepShown,
} from "./keypad-actions.js";

import { beginPaint, enterPaint, finishPaint } from "./paint-actions.js";

afterEach(() => {
  game.setOnActivity(() => {});
  resetKeypad();
  game.setNotesMode("auto");
  game.restart();
});

describe("keyboard LOCK keeps selection; touch HOLD and LOCK clear it", () => {
  it("keeps the selection on keyboard lock and unlock", () => {
    game.select(4);
    lockDigit(5);
    expect(padUi.locked).toBe(5);
    expect(padUi.shown).toBe(5);
    expect(game.selected).toBe(4);

    unlockKeepShown();
    expect(padUi.locked).toBe(0);
    expect(padUi.shown).toBe(5);
    expect(game.selected).toBe(4);

    game.select(8);
    expect(game.selected).toBe(8);
  });

  it("clears when HOLD engages and does not restore it when the hold ends", () => {
    game.select(4);
    clearKeypadSelection();
    expect(game.selected).toBe(-1);
    // Releasing the key only drops the gesture. Nothing puts 4 back.
    padUi.hold = null;
    padUi.gesture = null;
    expect(game.selected).toBe(-1);
  });

  it("a locked tap toggles the cell and does not select it", () => {
    game.select(4);
    lockDigit(2);
    clearKeypadSelection();
    expect(game.hasNote(0, 2)).toBe(true);
    lockTap(0);
    expect(game.hasNote(0, 2)).toBe(false);
    expect(game.selected).toBe(-1);

    lockTap(1);
    expect(game.value(1)).toBe(5);
    expect(game.selected).toBe(-1);
    expect(padUi.toast).toBe("2 locked — tap an empty cell");
  });

  it("a second finger previews the held digit and does not select the cell", () => {
    game.select(4);
    clearKeypadSelection();
    padUi.hold = { d: 2, pid: 1, travel: 0, toggled: 0, painting: true };
    padUi.gesture = {
      d: 2,
      pressed: true,
      holding: true,
      armed: false,
      armLock: false,
      remove: false,
      illegal: false,
      showLabel: true,
      label: "Tap or slide cells",
      bottom: "",
    };
    expect(game.hasNote(0, 2)).toBe(true);
    beginPaint(2, "hold");
    enterPaint(0);
    expect(game.hasNote(0, 2)).toBe(false);
    expect(game.selected).toBe(-1);
  });

  it("a new hold clears an earlier ghost and revisits keep the fixed brush", () => {
    game.setNotesMode("manual");
    lockDigit(4);
    lockTap(0);
    lockTap(0);
    expect(padUi.marks?.rem.has(0)).toBe(true);
    beginPaint(4, "hold");
    enterPaint(0);
    expect(game.hasNote(0, 4)).toBe(true);
    expect(padUi.marks?.rem.has(0)).toBe(false);
    enterPaint(0); // A revisit keeps the fixed add brush.
    expect(game.hasNote(0, 4)).toBe(true);
    expect(padUi.marks?.rem.has(0)).toBe(false);
    finishPaint();

    // A new stroke compares with the earlier addition and reports a real removal.
    beginPaint(4, "hold");
    enterPaint(0);
    expect(game.hasNote(0, 4)).toBe(false);
    expect(padUi.marks?.rem.has(0)).toBe(true);
    finishPaint();
  });

  it("does not restart the cue clock", () => {
    let time = 0;
    const play = createPlay({ live: false, idleMs: 30_000, now: () => time });
    play.bindLones(() => [2]);
    game.setOnActivity(() => play.noteActivity());
    play.start();

    time = 20_000;
    game.select(0);
    lockDigit(4);
    clearKeypadSelection();
    unlockKeepShown();
    play.step();
    expect(play.phase).toBe("idle");
    expect(game.selected).toBe(-1);

    time = 30_000;
    play.step();
    expect(play.phase).toBe("flash");

    time = 31_000;
    game.enter(0, 4);
    expect(play.phase).toBe("idle");
  });
});

describe("one highlighted digit for the keypad and the board", () => {
  it("ignores the selected cell's value", () => {
    game.select(21);
    expect(game.value(21)).toBe(2);
    expect(focusedDigit()).toBe(0);
    padUi.shown = 2;
    expect(focusedDigit()).toBe(2);
  });

  it("keeps the selection when a digit is first shown", () => {
    game.select(0);
    showDigit(4);
    finishDigitTap({ d: 4, t: 10, cell: 0, switched: false, hide: false });
    expect(focusedDigit()).toBe(4);
    expect(game.selected).toBe(0);
    expect(lastKeyPress()).toMatchObject({ d: 4, cell: 0 });
  });

  it("clears the selection when a tap switches the highlighted digit", () => {
    game.select(21);
    padUi.shown = 2;
    showDigit(4);
    expect(game.selected).toBe(21);
    expect(focusedDigit()).toBe(4);
    finishDigitTap({ d: 4, t: 20, cell: 21, switched: true, hide: false });
    expect(game.selected).toBe(-1);
    expect(focusedDigit()).toBe(4);
    expect(lastKeyPress()).toEqual({ d: 4, t: 20, cell: 21 });

    showDigit(5);
    finishDigitTap({ d: 5, t: 30, cell: -1, switched: true, hide: false });
    expect(game.selected).toBe(-1);
    expect(focusedDigit()).toBe(5);
  });

  it("clears the highlight and the selection together when the shown digit is tapped", () => {
    vi.useFakeTimers();
    try {
      game.select(21);
      padUi.shown = 2;
      showDigit(2);
      finishDigitTap({ d: 2, t: 40, cell: 21, switched: false, hide: true });
      expect(focusedDigit()).toBe(2);
      expect(game.selected).toBe(21);

      vi.advanceTimersByTime(299);
      expect(focusedDigit()).toBe(2);
      expect(game.selected).toBe(21);

      vi.advanceTimersByTime(1);
      expect(focusedDigit()).toBe(0);
      expect(padUi.shown).toBe(0);
      expect(game.selected).toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stale hide does not clear a newer highlight", () => {
    vi.useFakeTimers();
    try {
      game.select(21);
      padUi.shown = 2;
      finishDigitTap({ d: 2, t: 1, cell: 21, switched: false, hide: true });
      showDigit(4);
      game.select(0);
      vi.advanceTimersByTime(300);
      expect(focusedDigit()).toBe(4);
      expect(game.selected).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a keyboard write publishes the cell's value, including none", () => {
    game.select(0);
    game.fill(0, 4);
    syncHighlightAfterEdit(0, 0);
    expect(focusedDigit()).toBe(4);
    expect(game.selected).toBe(0);

    game.clearAnswer(0);
    syncHighlightAfterEdit(0, 4);
    expect(focusedDigit()).toBe(0);
    expect(game.selected).toBe(0);

    padUi.shown = 8;
    syncHighlightAfterEdit(0, 0);
    expect(focusedDigit()).toBe(8);
    expect(game.selected).toBe(0);
  });

  it("does not restart the cue when the highlight switches or clears", () => {
    vi.useFakeTimers();
    try {
      let time = 0;
      const play = createPlay({ live: false, idleMs: 30_000, now: () => time });
      play.bindLones(() => [2]);
      game.setOnActivity(() => play.noteActivity());
      play.start();

      time = 20_000;
      game.select(21);
      padUi.shown = 2;
      showDigit(4);
      finishDigitTap({ d: 4, t: 1, cell: 21, switched: true, hide: false });
      finishDigitTap({ d: 4, t: 2, cell: -1, switched: false, hide: true });
      vi.advanceTimersByTime(300);
      play.step();
      expect(play.phase).toBe("idle");
      expect(game.selected).toBe(-1);
      expect(focusedDigit()).toBe(0);

      time = 30_000;
      play.step();
      expect(play.phase).toBe("flash");
    } finally {
      vi.useRealTimers();
    }
  });
});
