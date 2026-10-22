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

  it("sizes the icon track from the tighter icon padding", () => {
    const step = headerStep(base);
    expect(step.iconCluster).toBe(base.timerChrome + 46 + base.pause + base.trackGap + 92);
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
