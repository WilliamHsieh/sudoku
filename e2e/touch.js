// Real touch input via the Chrome DevTools protocol, so the page receives
// genuine touchstart/touchmove/touchend and the derived pointer events.

export async function touchDriver(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
    });

  async function center(locator) {
    const b = await locator.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  return {
    async tap(locator, { holdMs = 60 } = {}) {
      const p = await center(locator);
      await send("touchStart", p.x, p.y);
      await page.waitForTimeout(holdMs);
      await send("touchEnd", p.x, p.y);
    },

    /**
     * Two presses inside the 300ms double-tap window (measured press to press).
     */
    async doubleTap(locator) {
      await this.tap(locator, { holdMs: 30 });
      await page.waitForTimeout(40);
      await this.tap(locator, { holdMs: 30 });
    },

    /** Drag upward by `dy` px in `steps`, optionally pausing before release. */
    async swipeUp(locator, dy, { steps = 12, stepMs = 16, holdMs = 60 } = {}) {
      const p = await center(locator);
      await send("touchStart", p.x, p.y);
      for (let s = 1; s <= steps; s++) {
        await page.waitForTimeout(stepMs);
        await send("touchMove", p.x, p.y - (dy * s) / steps);
      }
      await page.waitForTimeout(holdMs);
      await send("touchEnd", p.x, p.y - dy);
    },

    /** Drag downward by `dy` px. Same pacing as {@link swipeUp}. */
    async swipeDown(locator, dy, { steps = 12, stepMs = 16, holdMs = 60 } = {}) {
      const p = await center(locator);
      await send("touchStart", p.x, p.y);
      for (let s = 1; s <= steps; s++) {
        await page.waitForTimeout(stepMs);
        await send("touchMove", p.x, p.y + (dy * s) / steps);
      }
      await page.waitForTimeout(holdMs);
      await send("touchEnd", p.x, p.y + dy);
    },

    /**
     * Hold `key` with one finger and tap each cell with a second finger.
     * The first finger stays down until every tap has landed.
     * `holdMs` is how long the key is held before the second finger (the
     * toggle arms at 250 ms). `afterHold` runs in that gap, before any tap.
     */
    async holdAndTap(keyLocator, cellLocators, { beforeRelease, holdMs = 300, afterHold } = {}) {
      const k = await center(keyLocator);
      const finger = { x: k.x, y: k.y, id: 1, radiusX: 6, radiusY: 6, force: 1 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger] });
      await page.waitForTimeout(holdMs);
      if (afterHold) await afterHold();
      for (const loc of cellLocators) {
        const c = await center(loc);
        const second = { x: c.x, y: c.y, id: 2, radiusX: 6, radiusY: 6, force: 1 };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [finger, second],
        });
        await page.waitForTimeout(40);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [second] });
        await page.waitForTimeout(40);
      }
      if (beforeRelease) await beforeRelease();
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },

    start: (x, y) => send("touchStart", x, y),
    move: (x, y) => send("touchMove", x, y),
    end: (x, y) => send("touchEnd", x, y),
    center,
  };
}
