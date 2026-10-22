import { describe, expect, it } from "vitest";
import { headerStep } from "./header-fit.js";

const base = {
  content: 400,
  brand: 80,
  time: 45.2,
  timerChrome: 39,
  pause: 44,
  trackGap: 4,
  trackPad: 3,
  iconTrackPad: 2,
  segPad: 10,
  journal: 47.2,
  play: 27.4,
  iconFace: 44,
  gap: 8,
};

describe("headerStep", () => {
  it("keeps the brand and the labels when both clear 8px", () => {
    const step = headerStep(base);
    expect(step.icons).toBe(false);
    expect(step.brandHidden).toBe(false);
    expect(step.slot).toBe(46);
  });

  it("hides the brand while the labels still clear 8px", () => {
    const fitted = headerStep(base);
    const step = headerStep({ ...base, content: fitted.textCluster + base.gap });
    expect(step.icons).toBe(false);
    expect(step.brandHidden).toBe(true);
  });

  it("drops to icons when the labels would leave under 8px", () => {
    const fitted = headerStep(base);
    const step = headerStep({ ...base, content: fitted.textCluster + base.gap - 1 });
    expect(step.icons).toBe(true);
    expect(step.brandHidden).toBe(true);
  });

  it("follows the reserved slot, so a shorter clock string would not be the same step", () => {
    const reserved = headerStep(base);
    const atEdge = headerStep({ ...base, content: reserved.textCluster + base.gap - 1 });
    expect(atEdge.icons).toBe(true);
    const shorter = headerStep({ ...base, time: 20, content: atEdge.content });
    expect(shorter.icons).toBe(false);
  });

  it("uses 3px vertical / 2px horizontal icon padding for a 92×32 track", () => {
    const step = headerStep(base);
    expect(step.iconCluster).toBe(base.timerChrome + 46 + base.pause + base.trackGap + 92);
  });

  it("uniform 3px padding fails the 8px gap at 260 in DejaVu Sans", () => {
    const dejavu = { ...base, content: 244, time: 56 };
    expect(dejavu.content - headerStep(dejavu).iconCluster).toBe(9);
    expect(dejavu.content - headerStep({ ...dejavu, iconTrackPad: 3 }).iconCluster).toBe(7);
  });

  it("a wider label crosses to icons without a change in the zero width", () => {
    const fitted = headerStep(base);
    const wider = headerStep({
      ...base,
      journal: base.journal + 12,
      content: fitted.textCluster + 8,
    });
    expect(wider.icons).toBe(true);
  });
});

// Browser-measured probes: Google Fonts variable TTFs (Roboto, Noto Sans,
// Inter) and system DejaVu Sans. Check every 1px width without browser round trips.
describe("measured font steps from 260 to 320", () => {
  it.each([
    ["Roboto", 45.03125, 44.15625, 25.0625, 274],
    ["Noto Sans", 45.140625, 45.5625, 26.40625, 276],
    ["Inter", 50.421875, 47.53125, 26.703125, 283],
    ["DejaVu Sans", 55.828125, 51.921875, 30.84375, 296],
  ])(
    "%s retains labels exactly where the reserved cluster clears 8px",
    (_, time, journal, play, firstText) => {
      let transitions = 0;
      let previous = true;
      for (let width = 260; width <= 320; width++) {
        const input = { ...base, content: width - 16, time, journal, play };
        const step = headerStep(input);
        expect(step.icons).toBe(width < firstText);
        expect(
          input.content - (step.icons ? step.iconCluster : step.textCluster)
        ).toBeGreaterThanOrEqual(8);
        if (previous !== step.icons) transitions++;
        previous = step.icons;
      }
      expect(transitions).toBe(1);
    }
  );
});
