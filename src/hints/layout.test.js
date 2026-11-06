import { it, expect } from "vitest";
import { hintFrameFor } from "./layout.js";
it("uses right-side landscape controls below the 900px desktop breakpoint", () => {
  const f = hintFrameFor(
    { left: 132.5, right: 430.5, top: 88, bottom: 386 },
    { left: 579, width: 264 },
    { width: 874, height: 402 }
  );
  expect(f).toEqual({ mode: "side", left: 454.5, top: 88, width: 340, maxHeight: 298 });
  expect(f.top + f.maxHeight).toBeLessThan(402);
});
it("keeps portrait hints below the board and desktop hints beside it", () => {
  expect(
    hintFrameFor(
      { left: 8, right: 394, top: 54, bottom: 440 },
      { left: 8, width: 386 },
      { width: 402, height: 874 }
    )
  ).toEqual({ mode: "docked", left: 8, top: 452, width: 386, maxHeight: 406 });
  expect(
    hintFrameFor(
      { left: 100, right: 600, top: 80, bottom: 580 },
      { left: 624, width: 340 },
      { width: 1280, height: 800 }
    ).mode
  ).toBe("side");
});
