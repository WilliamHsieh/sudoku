import { describe, expect, it } from "vitest";
import { createHintStoryGesture } from "./story-navigation.js";

const start = {
  pointerId: 1,
  x: 330,
  y: 150,
  time: 100,
  stage: 1,
  allowed: true,
};
const end = { ...start, time: 200, left: 50, top: 100, width: 300, height: 400 };

describe("hint story taps", () => {
  it.each([
    [0, 70, 0],
    [0, 330, 1],
    [1, 70, -1],
    [1, 330, 1],
    [2, 70, -1],
    [2, 330, 0],
  ])("bounds stage %i tapping x=%i to direction %i", (stage, x, direction) => {
    const gesture = createHintStoryGesture();
    gesture.start({ ...start, stage, x });
    expect(gesture.finish({ ...end, stage, x })).toBe(direction);
  });

  it.each([120, 200, 240, 300, 800])(
    "limits navigation to narrow edges in a %ipx reading area",
    (width) => {
      const edgeWidth = Math.min(48, width * 0.2);
      for (const [offset, direction] of [
        [-1, 0],
        [0, -1],
        [edgeWidth - 0.5, -1],
        [edgeWidth, 0],
        [width * 0.25, 0],
        [width * 0.5, 0],
        [width * 0.75, 0],
        [width - edgeWidth - 0.5, 0],
        [width - edgeWidth, 1],
        [width - 0.5, 1],
        [width, 0],
      ]) {
        const gesture = createHintStoryGesture();
        const x = end.left + offset;
        gesture.start({ ...start, x });
        expect(gesture.finish({ ...end, x, width }), `offset ${offset}`).toBe(direction);
      }
    }
  );

  it.each([
    [100, 96],
    [96, 100],
    [300, 304],
    [304, 300],
  ])("rejects a small drift between the center and an edge (%i to %i)", (from, to) => {
    const gesture = createHintStoryGesture();
    gesture.start({ ...start, x: from });
    expect(gesture.finish({ ...end, x: to })).toBe(0);
  });

  it("allows ordinary small finger movement", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.move(1, 333, 154);
    expect(gesture.finish({ ...end, x: 333, y: 154 })).toBe(1);
  });

  it("does not navigate after dragging away and back", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.move(1, 330, 180);
    gesture.move(1, 330, 150);
    expect(gesture.finish(end)).toBe(0);
  });

  it("rejects a moved release even if no move event was observed", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    expect(gesture.finish({ ...end, x: 300 })).toBe(0);
  });

  it("cancels a press on scroll, pointer cancellation or leaving the area", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.cancel();
    expect(gesture.finish(end)).toBe(0);
  });

  it("rejects interactive, selected-text and modified presses", () => {
    const gesture = createHintStoryGesture();
    gesture.start({ ...start, allowed: false });
    expect(gesture.finish(end)).toBe(0);
    gesture.start(start);
    expect(gesture.finish({ ...end, allowed: false })).toBe(0);
  });

  it.each([
    { pointerId: 2 },
    { stage: 2 },
    { time: 601 },
    { time: 99 },
    { width: 0 },
    { height: 0 },
    { left: 331 },
    { left: -60 },
    { top: 151 },
    { top: -250 },
  ])("ignores an ineligible release: %j", (change) => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    expect(gesture.finish({ ...end, ...change })).toBe(0);
  });

  it("ignores another pointer and multi-touch interaction", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.move(2, start.x, start.y);
    expect(gesture.finish(end)).toBe(0);
    gesture.start(start);
    gesture.start({ ...start, pointerId: 2, allowed: false });
    expect(gesture.finish(end)).toBe(0);
  });

  it("consumes each press once and accepts a fresh repeated tap", () => {
    const gesture = createHintStoryGesture();
    expect(gesture.finish(end)).toBe(0);
    gesture.start(start);
    expect(gesture.finish(end)).toBe(1);
    expect(gesture.finish(end)).toBe(0);
    gesture.start(start);
    expect(gesture.finish(end)).toBe(1);
  });
});
