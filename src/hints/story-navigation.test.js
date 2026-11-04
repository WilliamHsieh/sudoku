import { describe, expect, it } from "vitest";
import { createHintStoryGesture } from "./story-navigation.js";

const start = {
  pointerId: 1,
  x: 240,
  y: 150,
  time: 100,
  stage: 1,
  allowed: true,
};
const end = { ...start, time: 200, left: 50, top: 100, width: 300, height: 400 };

describe("hint story taps", () => {
  it.each([
    [0, 100, 0],
    [0, 240, 1],
    [1, 100, -1],
    [1, 240, 1],
    [2, 100, -1],
    [2, 240, 0],
    [1, 200, 1],
  ])("bounds stage %i tapping x=%i to direction %i", (stage, x, direction) => {
    const gesture = createHintStoryGesture();
    gesture.start({ ...start, stage, x });
    expect(gesture.finish({ ...end, stage, x })).toBe(direction);
  });

  it("allows ordinary small finger movement", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.move(1, 243, 154);
    expect(gesture.finish({ ...end, x: 243, y: 154 })).toBe(1);
  });

  it("does not navigate after dragging away and back", () => {
    const gesture = createHintStoryGesture();
    gesture.start(start);
    gesture.move(1, 240, 180);
    gesture.move(1, 240, 150);
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
    { left: 241 },
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
