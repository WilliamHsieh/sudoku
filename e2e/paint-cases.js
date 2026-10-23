import { test, expect } from "@playwright/test";
import { cell, pencil, openBoard } from "./helpers.js";
import { touchDriver } from "./touch.js";

export const PAINT_PUZZLE = Array.from({ length: 81 }, (_, i) =>
  i === 4 ? 5 : i === 39 ? 7 : 0
).join("");

export async function paintSetup(page, mobile, manual = true) {
  await openBoard(page, `./?q=${PAINT_PUZZLE}`);
  if (manual) await page.locator("#notes-mode").evaluate((el) => el.click());
  const t = await touchDriver(page);
  const center = t.center;
  return {
    ...t,
    async lock(d = 5) {
      if (mobile) await t.swipeDown(page.locator(`.key[data-d="${d}"]`), 40);
      else await page.keyboard.press(`Shift+Digit${d}`);
    },
    async down(i) {
      const p = await center(cell(page, i));
      if (mobile) await t.start(p.x, p.y);
      else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
      }
    },
    async to(i) {
      const p = await center(cell(page, i));
      if (mobile) await t.move(p.x, p.y);
      else await page.mouse.move(p.x, p.y);
    },
    async outside() {
      const b = await page.locator(".board").boundingBox();
      if (mobile) await t.move(b.x - 4, b.y + b.height / 2);
      else await page.mouse.move(b.x - 4, b.y + b.height / 2);
    },
    async up() {
      if (mobile) await t.end(0, 0);
      else await page.mouse.up();
    },
  };
}

export function paintCases(mobile) {
  for (const key of ["Space", "Enter"]) {
    test(`${key} re-announces identical keyboard commits`, async ({ page }) => {
      await paintSetup(page, mobile);
      await cell(page, 37).dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 90,
      });
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Shift+Digit5");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      const changes = await observeAnnouncements(page);
      for (const i of [37, 38]) {
        if (i === 38) await page.keyboard.press("ArrowRight");
        await changes.evaluate((changes) => changes.splice(0));
        await page.keyboard.press(key);
        await expect(cell(page, i)).toHaveAttribute("data-notes", "5");
        await expect
          .poll(() => changes.evaluate((changes) => changes.filter(Boolean)))
          .toContain("Added 5 to 1 cell");
      }
    });

    test(`${key} renders a one-cell tint and fades it over 200ms`, async ({ page }) => {
      await paintSetup(page, mobile);
      await cell(page, 37).dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 90,
      });
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Shift+Digit5");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      // Sample in the page as soon as the commit renders. Protocol round trips
      // must not consume the short animation window on a loaded test machine.
      for (const notes of ["5", ""]) {
        const samples = await cell(page, 37).evaluateHandle((el) => {
          const done = new Promise((resolve) => {
            const observer = new MutationObserver(() => {
              if (!el.classList.contains("paint-committed")) return;
              observer.disconnect();
              const start = performance.now();
              const opacity = () => Number(getComputedStyle(el, "::after").opacity);
              const initial = opacity();
              setTimeout(() => {
                resolve({ initial, final: opacity(), elapsed: performance.now() - start });
              }, 250);
            });
            observer.observe(el, { attributes: true, attributeFilter: ["class"] });
          });
          return { done };
        });
        await page.keyboard.press(key);
        const result = await samples.evaluate((samples) => samples.done);
        expect(result.initial).toBeGreaterThan(0.99);
        expect(result.elapsed).toBeGreaterThanOrEqual(250);
        expect(result.final).toBeLessThanOrEqual(0.01);
        await expect(cell(page, 37)).toHaveAttribute("data-notes", notes);
      }
    });
  }

  test("identical pointer taps each update the live region", async ({ page }) => {
    const t = await paintSetup(page, mobile);
    await t.lock();
    const changes = await observeAnnouncements(page);
    for (const i of [37, 38]) {
      await t.down(i);
      // Count only commit mutations, excluding the clear at pointerdown.
      await changes.evaluate((changes) => changes.splice(0));
      await t.up();
      await expect(cell(page, i)).toHaveAttribute("data-notes", "5");
      await expect
        .poll(() => changes.evaluate((changes) => changes.filter(Boolean)))
        .toContain("Added 5 to 1 cell");
    }
  });

  test("LOCK add interpolates a row, skips given/refused cells, and undoes once", async ({
    page,
  }) => {
    const t = await paintSetup(page, mobile);
    await t.lock();
    await t.down(37);
    await t.to(42); // A single move: intermediate cells must be sampled.
    for (const i of [37, 38, 41, 42]) {
      await expect(cell(page, i)).toHaveAttribute("data-notes", "5");
      await expect(pencil(page, i, 5)).toHaveClass(/paint-blue/);
      await expect(cell(page, i)).toHaveClass(/paint-add/);
    }
    for (const i of [39, 40]) {
      await expect(cell(page, i)).not.toHaveClass(/paint-add|paint-remove/);
      await expect(cell(page, i).locator(".paint-added, .ghost")).toHaveCount(0);
    }
    await expect(cell(page, 42)).toHaveClass(/finger-add/);
    await expect(cell(page, 42)).toHaveCSS("box-shadow", "rgb(42, 86, 198) 0px 0px 0px 3px inset");
    await expect(page.locator("#undo")).toBeDisabled(); // Still a draft.
    await t.to(37); // Revisiting does not reverse the brush.
    await t.up();
    await expect(page.locator(".sr-only[aria-live]")).toHaveText(
      "Added 5 to 4 cells; 1 cell refused"
    );
    await page.locator("#undo").evaluate((el) => el.click());
    for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
    await expect(page.locator("#undo")).toBeDisabled();
  });

  test("LOCK remove includes no-op tint, preserves clues and answers, and groups Auto undo", async ({
    page,
  }) => {
    const t = await paintSetup(page, mobile, false);
    // Fill an answer before locking, then remove an Auto candidate from the row.
    await cell(page, 38).dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 44 });
    await page.keyboard.press("Digit8");
    await t.lock();
    const before = await page
      .locator(".cell")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-notes")));
    await t.down(37);
    await t.to(42);
    await expect(cell(page, 40)).toHaveClass(/paint-remove/); // Already lacks 5.
    await expect(pencil(page, 40, 5)).not.toHaveClass(/ghost/);
    for (const i of [37, 41, 42]) await expect(pencil(page, i, 5)).toHaveClass(/ghost/);
    for (const i of [38, 39]) await expect(cell(page, i)).not.toHaveClass(/paint-remove/);
    await expect(cell(page, 38)).toHaveAttribute("data-value", "8");
    await expect(cell(page, 39)).toHaveAttribute("data-value", "7");
    await t.up();
    await expect(page.locator(".sr-only[aria-live]")).toHaveText("Removed 5 from 3 cells");
    await page.locator("#undo").evaluate((el) => el.click());
    await expect
      .poll(() =>
        page.locator(".cell").evaluateAll((els) => els.map((e) => e.getAttribute("data-notes")))
      )
      .toEqual(before);
    await expect(cell(page, 38)).toHaveAttribute("data-value", "8");
  });

  test("illegal first cell flashes its blocker and rejects the whole stroke", async ({ page }) => {
    const t = await paintSetup(page, mobile);
    await t.lock();
    await t.down(40);
    await expect(cell(page, 4)).toHaveClass(/blocked/);
    await expect(page.locator(".toast")).toHaveText(
      "Can't place 5 — already in row, column or box"
    );
    await t.to(42);
    await expect(page.locator(".paint-added, .paint-add, .paint-remove")).toHaveCount(0);
    await t.up();
    await expect(page.locator(".toast")).toHaveText(
      "Can't place 5 — already in row, column or box"
    );
    await expect(page.locator("#undo")).toBeDisabled();
    await expect(cell(page, 42)).toHaveAttribute("data-notes", "");
  });

  test("leaving pauses without bridging the gap; Esc discards before it unlocks", async ({
    page,
  }) => {
    const t = await paintSetup(page, mobile);
    await t.lock();
    await t.down(37);
    await t.outside();
    await expect(page.locator(".finger-add, .finger-remove")).toHaveCount(0);
    await expect(cell(page, 37)).toHaveAttribute("data-notes", "5");
    await t.to(73);
    await expect(cell(page, 73)).toHaveAttribute("data-notes", "5");
    await expect(cell(page, 55)).toHaveAttribute("data-notes", "");
    await page.keyboard.press("Escape");
    for (const i of [37, 73]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "5");
    await expect(page.locator(".paint-added, .ghost, .paint-add")).toHaveCount(0);
    await expect(page.locator(".sr-only[aria-live]")).toHaveText("");
    await t.up();
    await page.keyboard.press("Escape");
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
    await expect(page.locator("#undo")).toBeDisabled();
  });

  for (const interruption of ["pointercancel", "capture", "blur", "hidden", "pause", "options"]) {
    test(`${interruption} discards a draft without history or announcement`, async ({ page }) => {
      const t = await paintSetup(page, mobile);
      await t.lock();
      await t.down(37);
      await t.to(38);
      if (interruption === "pointercancel") {
        if (mobile) await t.cancel();
        else await page.locator(".board").dispatchEvent("pointercancel", { pointerId: 1 });
      } else if (interruption === "capture") {
        await page.locator(".board").evaluate((board) => {
          // Chromium assigns the mouse ID 1, touch IDs start at 2.
          for (let id = 1; id < 20; id++)
            if (board.hasPointerCapture(id)) board.releasePointerCapture(id);
        });
        await t.to(41); // Delivers pending lostpointercapture.
      } else if (interruption === "blur")
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else if (interruption === "hidden")
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      else if (interruption === "pause") await page.keyboard.press("p");
      else
        await page
          .locator("[data-more]")
          .last()
          .evaluate((el) => el.click());
      for (const i of [37, 38]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
      await expect(page.locator("#undo")).toBeDisabled();
      await expect(page.locator(".paint-added, .ghost, .paint-add")).toHaveCount(0);
      await expect(page.locator(".sr-only[aria-live]")).toHaveText("");
      if (!(mobile && interruption === "pointercancel")) await t.up();
    });
  }

  test("a stroke can start on a given, and reduced motion holds marks until they clear", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const t = await paintSetup(page, mobile);
    await t.lock();
    await t.down(39);
    await t.to(42); // First editable cell is illegal: reject rather than paint beyond it.
    await t.up();
    await expect(page.locator("#undo")).toBeDisabled();
    await t.down(39);
    await t.to(37); // First editable cell is legal: choose add after skipping the given.
    await expect(cell(page, 38)).toHaveAttribute("data-notes", "5");
    await expect(cell(page, 37)).toHaveAttribute("data-notes", "5");
    // Freeze timers before commit so machine load cannot spend the 700ms
    // marker lifetime between assertions. CSS transitions are disabled by RM.
    const now = new Date();
    await page.clock.install({ time: now });
    await page.clock.pauseAt(now);
    await t.up();
    await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
    await page.clock.runFor(400);
    await expect(pencil(page, 37, 5)).toHaveCSS("transition-duration", "0s");
    await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
    await page.clock.runFor(299);
    await expect(pencil(page, 37, 5)).toHaveClass(/paint-added/);
    await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
    await page.clock.runFor(1);
    await expect(pencil(page, 37, 5)).not.toHaveClass(/paint-added/);
    await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(252, 239, 190)");
  });

  test("blue add chip shares the yellow chip geometry and fades on the 700ms clock", async ({
    page,
  }) => {
    const t = await paintSetup(page, mobile);
    await t.lock();
    // Seed the same cell with a normal yellow chip, then undo and paint it.
    await t.down(37);
    await t.up();
    await expect(pencil(page, 37, 5)).not.toHaveClass(/paint-added/);
    const measure = (el) => {
      const c = getComputedStyle(el),
        r = el.getBoundingClientRect(),
        cell = el.closest(".cell").getBoundingClientRect();
      return {
        width: c.width,
        height: c.height,
        radius: c.borderRadius,
        fontSize: c.fontSize,
        weight: c.fontWeight,
        lineHeight: c.lineHeight,
        position: c.position,
        left: r.x - cell.x,
        top: r.y - cell.y,
        background: c.backgroundColor,
        color: c.color,
        shadow: c.boxShadow,
      };
    };
    const yellow = await pencil(page, 37, 5).evaluate(measure);
    await page.locator("#undo").evaluate((el) => el.click());
    await expect(cell(page, 37)).toHaveAttribute("data-notes", "");
    await expect(page.locator(".board")).not.toHaveClass(/quiet/);
    await t.down(37);
    await expect(pencil(page, 37, 5)).toHaveClass(/paint-blue/);
    const blue = await pencil(page, 37, 5).evaluate(measure);
    for (const key of [
      "width",
      "height",
      "radius",
      "fontSize",
      "weight",
      "lineHeight",
      "position",
      "left",
      "top",
    ])
      expect(blue[key], key).toEqual(yellow[key]);
    expect(blue.background).toBe("rgb(223, 232, 250)");
    expect(blue.color).toBe("rgb(34, 73, 173)");
    expect(blue.shadow).toBe("rgb(143, 168, 224) 0px 0px 0px 0.5px");
    await t.up();
    await expect(pencil(page, 37, 5)).toHaveClass(/paint-added/);
    await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
    if (!mobile) await page.mouse.move(0, 0);
    await expect(pencil(page, 37, 5)).not.toHaveClass(/paint-added/);
    expect(await pencil(page, 37, 5).evaluate(measure)).toEqual(yellow);
  });
}

async function observeAnnouncements(page) {
  return page.locator(".sr-only[aria-live]").evaluateHandle((region) => {
    const changes = [];
    new MutationObserver(() => changes.push(region.textContent.trim())).observe(region, {
      subtree: true,
      characterData: true,
      childList: true,
    });
    return changes;
  });
}
