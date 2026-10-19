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

    start: (x, y) => send("touchStart", x, y),
    move: (x, y) => send("touchMove", x, y),
    end: (x, y) => send("touchEnd", x, y),
    center,
  };
}
