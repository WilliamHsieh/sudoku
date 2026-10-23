import { switchNotesMode } from "./helpers.js";
// Keypad r2 on the iPhone viewport: show, double-tap fill, swipe-down lock,
// lock-mode taps, two-finger hold, the legacy option, and the cue clock.
import { test, expect } from "@playwright/test";
import { clearSelection, cell, openBoard, expectValue, pencil, DEMO_PUZZLE } from "./helpers.js";
import { touchDriver } from "./touch.js";

const key = (page, d) => page.locator(`.key[data-d="${d}"]`);
const pad = (page) => page.locator("#keypad");

/** Done eases the sheet out; the next gesture has to wait until it is gone. */
async function closeOptions(page) {
  await page.locator("#opts-done").click();
  await expect(page.locator("dialog.opts")).toBeHidden();
}

/** Keep browser and assertion time out of the gesture and cue thresholds. */
async function openWithPausedClock(page) {
  const time = new Date("2026-01-01T00:00:00Z");
  await page.clock.install({ time });
  // Pause in the future on the blank page, before application timers exist.
  await page.clock.pauseAt(new Date(time.getTime() + 1_000));
  await openBoard(page);
}

/** Advance browser time while touching, rather than waiting in wall time. */
async function clockTap(page, t, locator) {
  const p = await t.center(locator);
  await t.start(p.x, p.y);
  await page.clock.runFor(30);
  await t.end(p.x, p.y);
}

/** Both handlers read performance.now() on press, so the gap includes the first 30ms tap. */
async function clockDoubleTap(page, t, locator, gap = 299) {
  await clockTap(page, t, locator);
  await page.clock.runFor(gap - 30);
  await clockTap(page, t, locator);
}

/** Empty cells whose Auto notes include d. */
async function cellsWithNote(page, d) {
  return page.evaluate((digit) => {
    return [...document.querySelectorAll(".board > .cell")]
      .filter(
        (el) => !el.dataset.value && (el.getAttribute("data-notes") || "").includes(String(digit))
      )
      .map((el) => Number(el.dataset.i));
  }, d);
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.tags.includes("@keypad-timing")) await openWithPausedClock(page);
  else await openBoard(page);
});

test(
  "a tap shows the digit and a later tap hides it, without changing the board",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    const notes = await cell(page, 0).getAttribute("data-notes");
    await t.tap(key(page, 4));
    await expect(pad(page)).toHaveAttribute("data-shown", "4");
    await expect(pad(page)).toHaveAttribute("data-locked", "0");
    await expect(key(page, 4)).toHaveClass(/shown/);
    await expect(page.locator(".pad-hint")).toContainText("4");
    await expect(page.locator(".pad-hint")).toContainText("Double-tap fills");
    await expectValue(page, 0, 0);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", notes);

    await page.clock.runFor(301);
    // HIDE_MS starts at release and aliases the 300ms double-tap window.
    await clockTap(page, t, key(page, 4));
    await page.clock.runFor(299);
    await expect(pad(page)).toHaveAttribute("data-shown", "4");
    await expect(cell(page, 0)).toHaveClass(/selected/);
    await page.clock.runFor(2);
    await expect(pad(page)).toHaveAttribute("data-shown", "0");
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    await expectValue(page, 0, 0);
  }
);

test(
  "double-tap fills the focused cell and does not clear it",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await clockDoubleTap(page, t, key(page, 4));
    await expectValue(page, 0, 4);
    await expect(pad(page)).toHaveAttribute("data-shown", "4");
    await page.clock.runFor(301);
    await clockDoubleTap(page, t, key(page, 4));
    await expectValue(page, 0, 4);

    await clearSelection(page);
    await expect(cell(page, 0)).not.toHaveClass(/selected/);
    await clockDoubleTap(page, t, key(page, 6));
    await expect(page.locator(".toast")).toHaveText("Select a cell, then double-tap");
    await expectValue(page, 0, 4);
    await expect(pad(page)).toHaveAttribute("data-shown", "6");
  }
);

for (const duration of [499, 501]) {
  test(
    `a ${duration} ms key press ${duration < 500 ? "schedules hiding" : "is not a tap"}`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      // Select a given 4 so the key is already shown. TAP_MAX_MS is 500ms;
      // release below it schedules hiding, while a longer press is ignored.
      await clockTap(page, t, cell(page, 13));
      await expect(pad(page)).toHaveAttribute("data-shown", "4");
      const p = await t.center(key(page, 4));
      await t.start(p.x, p.y);
      await page.clock.runFor(duration);
      await t.end(p.x, p.y);
      await page.clock.runFor(301);
      await expect(pad(page)).toHaveAttribute("data-shown", duration < 500 ? "0" : "4");
      await expectValue(page, 13, 4);
      await expect(page.locator("#undo")).toBeDisabled();
    }
  );
}

for (const gap of [299, 301]) {
  test(
    `key double-tap at ${gap} ms ${gap < 300 ? "fills" : "does not fill"}`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      await clockTap(page, t, cell(page, 0));
      await clockDoubleTap(page, t, key(page, 4), gap);
      await expectValue(page, 0, gap < 300 ? 4 : 0);
      await expect(pad(page)).toHaveAttribute("data-shown", "4");
      await expect(cell(page, 0)).toHaveAttribute("data-notes", gap < 300 ? "" : "23467");
    }
  );

  test(
    `board double-tap at ${gap} ms ${gap < 300 ? "fills" : "does not fill"}`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      // A lone candidate needs no keypad setup and cannot mask a missed double-tap.
      await expect(cell(page, 49)).toHaveAttribute("data-notes", "5");
      await clockDoubleTap(page, t, cell(page, 49), gap);
      await expectValue(page, 49, gap < 300 ? 5 : 0);
      await expect(cell(page, 49)).toHaveClass(/selected/);
      await expect(pad(page)).toHaveAttribute("data-shown", gap < 300 ? "5" : "0");
      if (gap < 300) await expect(page.locator("#undo")).toBeEnabled();
      else await expect(page.locator("#undo")).toBeDisabled();
    }
  );
}

test("swipe down locks at 28px, a 20px drag and a retreat under 22px do not", async ({ page }) => {
  const t = await touchDriver(page);
  await t.swipeDown(key(page, 5), 20);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(key(page, 5)).not.toHaveClass(/locked/);

  const k = key(page, 5);
  const p = await t.center(k);
  await t.start(p.x, p.y);
  await t.move(p.x, p.y + 30);
  await expect(k).toHaveClass(/arm-lock/);
  await expect(k.locator(".label.bottom")).toHaveText("Release: lock");
  await t.move(p.x, p.y + 20);
  await expect(k).not.toHaveClass(/arm-lock/);
  await t.end(p.x, p.y + 20);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");

  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "5");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");
  await expect(k).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad-hint")).toContainText("5 locked");
  await expect(page.locator(".pad-hint")).toContainText("Tap 5 to unlock");
});

test("a locked digit toggles empty cells, and given or filled cells only toast", async ({
  page,
}) => {
  const t = await touchDriver(page);
  const ids = (await cellsWithNote(page, 2)).filter((i) => i !== 0);
  expect(ids.length).toBeGreaterThanOrEqual(3);
  const [a, b, c] = ids;
  await t.tap(cell(page, b));
  await t.swipeDown(key(page, 2), 40);

  await t.tap(cell(page, a));
  await t.tap(cell(page, b));
  await t.tap(cell(page, c));
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  for (const i of [a, b, c]) {
    await expect(cell(page, i)).not.toHaveAttribute("data-notes", /2/);
    await expectValue(page, i, 0);
  }
  await t.tap(cell(page, a), { holdMs: 30 });
  await page.waitForTimeout(40);
  await t.tap(cell(page, a), { holdMs: 30 });
  await expectValue(page, a, 0);
  await expect(cell(page, a)).not.toHaveAttribute("data-notes", /2/);
  await expect(page.locator(".cell.selected")).toHaveCount(0);

  for (let n = 0; n < 5; n++) await t.tap(page.locator("#undo"));
  for (const i of [a, b, c]) {
    await expect(cell(page, i)).toHaveAttribute("data-notes", /2/);
  }

  await t.tap(key(page, 2));
  await t.tap(cell(page, b));
  await t.doubleTap(key(page, 4));
  await expectValue(page, b, 4);
  await t.tap(cell(page, a));
  await t.swipeDown(key(page, 3), 40);
  await t.tap(cell(page, b));
  await expect(page.locator(".toast")).toHaveText("3 locked — tap an empty cell");
  await expectValue(page, b, 4);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await t.tap(cell(page, 1));
  await expect(page.locator(".toast")).toHaveText("3 locked — tap an empty cell");
  await expectValue(page, 1, 5);
  await expect(page.locator(".cell.selected")).toHaveCount(0);

  await t.tap(key(page, 3));
  await t.swipeDown(key(page, 5), 40);
  const notes = await cell(page, 0).getAttribute("data-notes");
  const first = await t.center(cell(page, 0));
  const time = Date.now();
  await page.clock.install({ time });
  await page.clock.pauseAt(time + 1_000);
  await t.start(first.x, first.y);
  await expect(cell(page, 1)).toHaveClass(/blocked/);
  await expect(page.locator(".toast")).toHaveText("Can't place 5 — already in row, column or box");
  await expect(cell(page, 0)).not.toHaveClass(/blocked/);
  await t.end(first.x, first.y);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", notes || "");
  await expectValue(page, 0, 0);
});

test("lock clears by key tap, another digit, swipe, Escape, pause, More and restart", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  // Set up the answer without making this lock-exit test depend on tap timing.
  await page.keyboard.press("Digit4");
  await expectValue(page, 0, 4);
  await t.swipeDown(key(page, 5), 40);

  await t.tap(key(page, 5));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");
  await expectValue(page, 0, 4);

  await t.swipeDown(key(page, 5), 40);
  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "5");

  await t.swipeDown(key(page, 5), 40);
  await t.swipeDown(key(page, 3), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "3");

  await t.tap(key(page, 6));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await expectValue(page, 0, 4);

  await t.swipeDown(key(page, 6), 40);
  await page.keyboard.press("Escape");
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator("#time-control"));
  await expect(page.locator(".paused-cover")).toBeVisible();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await t.tap(page.locator("#resume"));

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator(".tools [data-more]"));
  await expect(page.locator("dialog.opts")).toBeVisible();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "6");
  await closeOptions(page);

  await t.swipeDown(key(page, 6), 40);
  await t.tap(page.locator(".tools [data-more]"));
  await page.locator("#opt-restart").click();
  await page.locator("#confirm-ok").click();
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await expectValue(page, 0, 0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
});

test(
  "a second finger toggles only after the key is held 250 ms",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);
    const [a] = await cellsWithNote(page, 2);
    await t.tap(cell(page, a));
    const notes = await cell(page, a).getAttribute("data-notes");
    await t.holdAndTap(key(page, 2), [cell(page, a)], {
      holdMs: 0,
      afterHold: async () => {
        await expect(key(page, 2)).not.toHaveClass(/holding/);
      },
    });
    await expect(cell(page, a)).toHaveAttribute("data-notes", notes || "");
    await expect(page.locator("#undo")).toBeDisabled();
    await t.holdAndTap(key(page, 2), [cell(page, a)], {
      holdMs: 0,
      afterHold: async () => {
        await page.clock.runFor(300);
        await expect(key(page, 2)).toHaveClass(/holding/);
      },
    });
    await expect(cell(page, a)).not.toHaveAttribute("data-notes", /2/);
  }
);

for (const delay of [249, 251]) {
  test(
    `second finger at ${delay} ms ${delay < 250 ? "is ignored" : "toggles a candidate"}`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      await clockTap(page, t, cell(page, 0));
      await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
      await t.holdAndTap(key(page, 2), [cell(page, 0)], {
        holdMs: 0,
        afterHold: () => page.clock.runFor(delay),
        beforeRelease: async () => {
          if (delay < 250) {
            await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");
            await expect(page.locator("#undo")).toBeDisabled();
            await expect(key(page, 2)).not.toHaveClass(/holding/);
            await expect(cell(page, 0)).toHaveClass(/selected/);
          } else {
            await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
            await expect(page.locator("#undo")).toBeDisabled(); // HOLD is a draft until key release.
            await expect(key(page, 2)).toHaveClass(/holding/);
            await expect(page.locator(".cell.selected")).toHaveCount(0);
          }
        },
      });
      await expect(cell(page, 0)).toHaveAttribute("data-notes", delay < 250 ? "23467" : "3467");
      await expectValue(page, 0, 0);
      if (delay > 250) await expect(page.locator("#undo")).toBeEnabled();
      await expect(key(page, 2)).not.toHaveClass(/holding/);
    }
  );
}

/** Sample every rendered frame, including while the held key stays down. */
function sampleGhosts(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const counts = [];
        const start = performance.now();
        function sample(now) {
          counts.push(document.querySelectorAll(".pencil-box.ghost").length);
          if (now - start >= 400) resolve(counts);
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      })
  );
}

test("revisiting an added candidate within one HOLD stroke keeps the brush and never ghosts", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await switchNotesMode(page);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  let sampling;
  await t.holdAndTap(key(page, 4), [cell(page, 0), cell(page, 0)], {
    afterHold: () => {
      sampling = sampleGhosts(page);
    },
    beforeRelease: async () => {
      await expect(cell(page, 0)).toHaveAttribute("data-notes", "4");
      const counts = await sampling;
      expect(counts.length).toBeGreaterThan(1);
      expect(Math.max(...counts)).toBe(0);
    },
  });
  const counts = await sampleGhosts(page);
  expect(counts.length).toBeGreaterThan(1);
  expect(Math.max(...counts)).toBe(0);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "4");
  await t.tap(page.locator("#undo"));
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  await expect(page.locator(".cell.tick-add, .cell.tick-rem")).toHaveCount(0);
});

test("separate lock taps still ghost a removal, even when the puzzle's net change is zero", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await switchNotesMode(page);
  await t.swipeDown(key(page, 4), 40);
  await t.tap(cell(page, 0));
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "4");
  await expect(pencil(page, 0, 4)).not.toHaveClass(/ghost/);
  await t.tap(cell(page, 0));
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  await expect(pencil(page, 0, 4)).toHaveClass(/ghost/);
  await expect(pencil(page, 0, 4)).toBeVisible();
  await expect(page.locator(".cell.tick-add, .cell.tick-rem")).toHaveCount(0);
  await expect(pencil(page, 0, 4)).not.toHaveClass(/ghost/);
});

test("a HOLD removal of a candidate from an earlier stroke still ghosts", async ({ page }) => {
  const t = await touchDriver(page);
  await switchNotesMode(page);
  await t.tap(cell(page, 0));
  await t.swipeUp(key(page, 4), 60);
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "4");
  await t.holdAndTap(key(page, 4), [cell(page, 0)], {
    beforeRelease: async () => {
      await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
      await expect(pencil(page, 0, 4)).toHaveClass(/ghost/);
      await expect(pencil(page, 0, 4)).toBeVisible();
    },
  });
  await expect(pencil(page, 0, 4)).not.toHaveClass(/ghost/);
});

test("two-finger hold toggles candidates as one undo step", async ({ page }) => {
  const t = await touchDriver(page);
  const ids = await cellsWithNote(page, 2);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [a, b] = ids;
  await t.tap(cell(page, a));
  await t.holdAndTap(key(page, 2), [cell(page, a), cell(page, b)], {
    beforeRelease: async () => {
      await expect(key(page, 2)).toHaveClass(/holding/);
      await expect(key(page, 2).locator(".label:not(.bottom)")).toHaveText("Tap or slide cells");
      await expect(page.locator(".cell.selected")).toHaveCount(0);
    },
  });
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(cell(page, a)).not.toHaveAttribute("data-notes", /2/);
  await expect(cell(page, b)).not.toHaveAttribute("data-notes", /2/);
  await t.tap(page.locator("#undo"));
  await expect(cell(page, a)).toHaveAttribute("data-notes", /2/);
  await expect(cell(page, b)).toHaveAttribute("data-notes", /2/);
  await expect(page.locator("#undo")).toBeDisabled();
});

test(
  "legacy mode flashes blockers on release, including a tap that enters",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);
    await t.tap(cell(page, 0));
    await t.tap(key(page, 5));
    await expect(cell(page, 1)).not.toHaveClass(/blocked/);
    await expectValue(page, 0, 0);

    await t.tap(page.locator(".tools [data-more]"));
    await page.locator("#opt-tap-fill").click();
    await page.locator("#opts-done").click();
    await page.clock.runFor(400);
    await expect(page.locator("dialog.opts")).toBeHidden();

    const k = key(page, 5);
    const p = await t.center(k);
    await t.start(p.x, p.y);
    await t.move(p.x, p.y - 16);
    await t.end(p.x, p.y - 16);
    await expect(cell(page, 1)).toHaveClass(/blocked/);
    await expectValue(page, 0, 0);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "23467");

    await t.tap(key(page, 5));
    await expect(cell(page, 1)).toHaveClass(/blocked/);
    await expectValue(page, 0, 5);
  }
);

test("legacy tap-to-fill is off by default, then a tap fills and a second tap clears", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await expect(page.locator(".pad-hint")).toHaveText(
    "Tap = show · Double-tap = fill · Swipe ↑ candidate, ↓ lock"
  );
  await t.tap(page.locator(".tools [data-more]"));
  const row = page.locator("#opt-tap-fill");
  await expect(row).toHaveAttribute("aria-checked", "false");
  await expect(row).toContainText("Tap to fill");
  await expect(page.locator("#tap-fill-desc")).toHaveText("Off: tap shows, double-tap fills");
  await row.click();
  await expect(row).toHaveAttribute("aria-checked", "true");
  await closeOptions(page);
  await expect(page.locator(".pad-hint")).toHaveText("Tap = answer · Swipe up = candidate");

  await t.tap(cell(page, 0));
  await t.tap(key(page, 4));
  await expectValue(page, 0, 4);
  await t.tap(key(page, 4));
  await expectValue(page, 0, 0);

  await page.reload();
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to game/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await expect(page.locator(".pad-hint")).toHaveText("Tap = answer · Swipe up = candidate");
  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "5");
});

test("screen-reader activation of a key fills, including in legacy mode", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await key(page, 4).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);
  await key(page, 4).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 4);

  await t.tap(page.locator(".tools [data-more]"));
  await page.locator("#opt-tap-fill").click();
  await closeOptions(page);
  await t.tap(page.locator("#erase"));
  await expectValue(page, 0, 0);
  await key(page, 7).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 7);
  await key(page, 7).focus();
  await page.keyboard.press("Enter");
  await expectValue(page, 0, 7);
});

test(
  "showing a digit does not restart the cue; a fill or note toggle does",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);

    await page.clock.fastForward(20_000);
    await t.tap(key(page, 4));
    await expect(pad(page)).toHaveAttribute("data-shown", "4");
    await expectValue(page, 0, 0);
    // CUE_IDLE_MS is 30,000ms. Selection/highlight gestures above consumed no virtual time.
    await page.clock.fastForward(9_999);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.runFor(2);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");

    await t.tap(cell(page, 0));
    await t.swipeUp(key(page, 2), 60);
    await expect(cell(page, 0)).toHaveAttribute("data-notes", "3467");
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.fastForward(20_000);
    await clockDoubleTap(page, t, key(page, 4));
    await expectValue(page, 0, 4);
    await page.clock.fastForward(10_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    // The fill resets on pointerdown; the second tap then consumes 30ms.
    await page.clock.fastForward(19_969);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.runFor(2);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
    // CUE_FLASH_MS is 1,500ms from the pulse's start (we are 1ms into it).
    await page.clock.runFor(1_498);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
    await page.clock.runFor(2);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
  }
);

test("the first-run coach shows once", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("kp-coach-cleared")) return;
    localStorage.removeItem("sudoku-keypad-coach");
    sessionStorage.setItem("kp-coach-cleared", "1");
  });
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to game/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  const coach = page.locator(".coach");
  await expect(coach).toBeVisible();
  await expect(coach).toContainText("New way to use the keys");
  await expect(coach).toContainText("Highlights this digit and its candidates");
  await expect(coach).toContainText(
    "Locks it; tap or slide across empty cells to toggle candidates"
  );
  await expect(coach).toContainText("Double-tap");
  await page.locator("#coach-ok").click();
  await expect(coach).toHaveCount(0);
  await page.reload();
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to game/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await expect(page.locator(".coach")).toHaveCount(0);
});

test("a lone candidate fills ahead of the focused digit, which then follows that fill", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await expect(cell(page, 49)).toHaveAttribute("data-notes", "5");

  await t.tap(key(page, 3));
  await expect(pad(page)).toHaveAttribute("data-shown", "3");
  await expect(key(page, 3)).toHaveClass(/shown/);
  await expect(cell(page, 15)).toHaveClass(/same/);
  await t.doubleTap(cell(page, 49));
  await expectValue(page, 49, 5);
  await expect(pad(page)).toHaveAttribute("data-shown", "5");
  await expect(key(page, 5)).toHaveClass(/shown/);
  await expect(key(page, 3)).not.toHaveClass(/shown/);
  await expect(cell(page, 49)).toHaveClass(/same/);
  await expect(cell(page, 49)).toHaveClass(/selected/);
  await expect(cell(page, 1)).toHaveClass(/same/);
  await expect(cell(page, 27)).toHaveClass(/same/);
  await expect(cell(page, 65)).toHaveClass(/same/);
  await expect(cell(page, 15)).not.toHaveClass(/same/);
  await expect(page.locator('.pencil-box.matching-number[data-d="3"]')).toHaveCount(0);
  await expect(page.locator('.pencil-box.matching-number[data-d="5"]').first()).toBeVisible();

  await t.tap(page.locator("#undo"));
  await expectValue(page, 49, 0);
  await t.tap(cell(page, 42));
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "578");
  await t.swipeUp(key(page, 8), 60);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "57");
  await t.tap(key(page, 8));
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await t.tap(key(page, 3));
  await expect(pad(page)).toHaveAttribute("data-shown", "3");
  await t.doubleTap(cell(page, 42));
  await expectValue(page, 42, 3);
  await expect(pad(page)).toHaveAttribute("data-shown", "3");
  await expect(key(page, 3)).toHaveClass(/shown/);
  await expect(cell(page, 42)).toHaveClass(/same/);
  await expect(cell(page, 42)).toHaveClass(/selected/);

  await t.tap(page.locator("#undo"));
  await expectValue(page, 42, 0);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "57");
  await t.tap(key(page, 3));
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await t.doubleTap(cell(page, 42));
  await expectValue(page, 42, 0);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "57");
  await expect(cell(page, 42)).toHaveClass(/selected/);
  await expect(pad(page)).toHaveAttribute("data-shown", "0");

  await t.tap(key(page, 3));
  await expect(pad(page)).toHaveAttribute("data-shown", "3");
  await t.doubleTap(cell(page, 1));
  await expectValue(page, 1, 5);
  await expect(cell(page, 1)).toHaveClass(/given/);
  await expect(cell(page, 1)).not.toHaveClass(/user/);
});

test("Manual: double-tap fills the focused digit without notes and keeps all 4s highlighted", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await switchNotesMode(page);
  await expect(
    page.getByRole("button", { name: "Notes mode: Manual" }).filter({ visible: true })
  ).toHaveAttribute("aria-expanded", "false");
  await expect(cell(page, 0)).toHaveAttribute("data-notes", "");
  await expectValue(page, 0, 0);

  await t.tap(key(page, 4));
  await expect(key(page, 4)).toHaveClass(/shown/);
  await t.doubleTap(cell(page, 0));
  await expectValue(page, 0, 4);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(key(page, 4)).toHaveClass(/shown/);
  await expect(page.locator(".key.shown")).toHaveCount(1);
  await expect(cell(page, 0)).toHaveClass(/same/);
  await expect(page.locator('.cell[data-value="4"]')).toHaveCount(6);
  await expect(page.locator('.cell.same[data-value="4"]')).toHaveCount(6);
  await expect(page.locator('.cell.same:not([data-value="4"])')).toHaveCount(0);
});

test("tapping the lit digit clears the highlight everywhere and the selection", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 21));
  await expect(cell(page, 21)).toHaveClass(/selected/);
  await expect(pad(page)).toHaveAttribute("data-shown", "2");
  await expect(key(page, 2)).toHaveClass(/shown/);
  await expect(cell(page, 37)).toHaveClass(/same/);
  await expect(page.locator(".pencil-box.matching-number").first()).toBeVisible();

  await t.tap(key(page, 2));
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await expect(page.locator(".key.shown")).toHaveCount(0);
  await expect(page.locator(".cell.same")).toHaveCount(0);
  await expect(page.locator(".pencil-box.matching-number")).toHaveCount(0);
  await expect(page.locator(".cell.selected")).toHaveCount(0);

  await page.waitForTimeout(400);
  await expect(pad(page)).toHaveAttribute("data-shown", "0");
  await expect(page.locator(".cell.selected")).toHaveCount(0);
});

test("tapping a different digit clears the selection and moves the highlight", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 21));
  await expect(pad(page)).toHaveAttribute("data-shown", "2");
  await t.tap(key(page, 4));
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(key(page, 4)).toHaveClass(/shown/);
  await expect(key(page, 2)).not.toHaveClass(/shown/);
  await expect(cell(page, 37)).not.toHaveClass(/same/);
  await expect(cell(page, 13)).toHaveClass(/same/);
  await expect(page.locator('.pencil-box.matching-number[data-d="2"]')).toHaveCount(0);
  await expect(page.locator('.pencil-box.matching-number[data-d="4"]').first()).toBeVisible();

  await page.waitForTimeout(400);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
});

test("a double-tap still fills the cell a digit switch just cleared", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 0));
  await t.tap(key(page, 5));
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await page.waitForTimeout(350);
  // Press to press stays inside 300ms. Asserting between the taps blows the window.
  await t.doubleTap(key(page, 4));
  await expectValue(page, 0, 4);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(key(page, 4)).toHaveClass(/shown/);
  await expect(cell(page, 13)).toHaveClass(/same/);
});

test(
  "switching or clearing the highlight does not restart the cue",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);

    await page.clock.fastForward(20_000);
    await t.tap(cell(page, 21));
    await expect(pad(page)).toHaveAttribute("data-shown", "2");
    await t.tap(key(page, 4));
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    await expect(pad(page)).toHaveAttribute("data-shown", "4");
    // The clock is frozen, so this is what moves the double-tap window on.
    await page.clock.runFor(400);
    await t.tap(cell(page, 0));
    await t.tap(key(page, 4));
    await page.clock.runFor(400);
    await expect(pad(page)).toHaveAttribute("data-shown", "0");
    await expect(page.locator(".cell.same")).toHaveCount(0);
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    // The two 400ms advances above leave 9,199ms until just before CUE_IDLE_MS.
    await page.clock.fastForward(9_199);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.runFor(2);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
  }
);

test("lock and hold clear the selection and leave it clear", async ({ page }) => {
  const t = await touchDriver(page);
  const [empty] = await cellsWithNote(page, 2);
  await t.tap(cell(page, 1));
  await expect(cell(page, 1)).toHaveClass(/selected/);
  await expect(cell(page, 27)).toHaveClass(/same/);

  await t.swipeDown(key(page, 2), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "2");
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(cell(page, 27)).not.toHaveClass(/same/);
  await expect(cell(page, 21)).toHaveClass(/same/);
  await expect(pencil(page, empty, 2)).toHaveClass(/matching-number/);

  await t.tap(cell(page, empty));
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(cell(page, empty)).not.toHaveAttribute("data-notes", /2/);
  await t.tap(cell(page, 1));
  await expect(page.locator(".toast")).toHaveText("2 locked — tap an empty cell");
  await expect(page.locator(".cell.selected")).toHaveCount(0);

  await t.tap(key(page, 2));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "2");
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(cell(page, 21)).toHaveClass(/same/);

  await t.tap(cell(page, empty));
  await expect(cell(page, empty)).toHaveClass(/selected/);
  await t.holdAndTap(key(page, 4), [], {
    holdMs: 320,
    afterHold: async () => {
      await expect(key(page, 4)).toHaveClass(/holding/);
      await expect(page.locator(".cell.selected")).toHaveCount(0);
      await expect(pad(page)).toHaveAttribute("data-shown", "4");
      await expect(page.locator('.pencil-box.matching-number[data-d="4"]').first()).toBeVisible();
    },
  });
  await expect(key(page, 4)).not.toHaveClass(/holding/);
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");

  await page.waitForTimeout(400);
  await t.doubleTap(key(page, 4));
  await expect(page.locator(".toast")).toHaveText("Select a cell, then double-tap");
  await expectValue(page, empty, 0);
});

test("legacy lock and hold clear the selection; a short tap still fills", async ({ page }) => {
  const t = await touchDriver(page);
  await t.tap(page.locator(".tools [data-more]"));
  await page.locator("#opt-tap-fill").click();
  await closeOptions(page);

  await t.tap(cell(page, 0));
  await t.tap(key(page, 4), { holdMs: 80 });
  await expectValue(page, 0, 4);
  await expect(cell(page, 0)).toHaveClass(/selected/);
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(key(page, 4)).toHaveClass(/shown/);
  await expect(cell(page, 13)).toHaveClass(/same/);

  await t.swipeDown(key(page, 5), 40);
  await expect(pad(page)).toHaveAttribute("data-locked", "5");
  await expect(page.locator(".cell.selected")).toHaveCount(0);

  await t.tap(key(page, 5));
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await t.tap(cell(page, 2));
  await expect(cell(page, 2)).toHaveClass(/selected/);
  await t.holdAndTap(key(page, 3), [], {
    holdMs: 320,
    afterHold: async () => {
      await expect(key(page, 3)).toHaveClass(/holding/);
      await expect(page.locator(".cell.selected")).toHaveCount(0);
    },
  });
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expectValue(page, 2, 0);
});

test(
  "clearing the selection for lock does not restart the cue",
  { tag: "@keypad-timing" },
  async ({ page }) => {
    const t = await touchDriver(page);

    await page.clock.fastForward(20_000);
    await t.tap(cell(page, 1));
    await expect(cell(page, 1)).toHaveClass(/selected/);
    await t.swipeDown(key(page, 4), 40);
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    // CUE_IDLE_MS is 30,000ms. Selection/highlight gestures above consumed no virtual time.
    await page.clock.fastForward(9_999);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.runFor(2);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
  }
);

for (const mode of ["auto", "manual"]) {
  for (const count of [0, 1, 2]) {
    for (const focused of [0, 3, 5]) {
      test(
        `${mode}: ${count} candidates and focus ${focused} obey board double-tap priority`,
        { tag: "@keypad-timing" },
        async ({ page }) => {
          const t = await touchDriver(page);
          if (mode === "manual") await switchNotesMode(page);
          await clockTap(page, t, cell(page, 42));
          const desired = count === 0 ? "" : count === 1 ? "5" : "57";
          const current = await cell(page, 42).getAttribute("data-notes");
          for (const d of [5, 7, 8]) {
            if (current.includes(String(d)) === desired.includes(String(d))) continue;
            await page.keyboard.press(`Shift+Digit${d}`);
            await page.keyboard.press("Space");
            await page.keyboard.press("Escape");
          }
          await expect(cell(page, 42)).toHaveAttribute("data-notes", desired);
          await page.clock.runFor(701);
          const shown = Number(await pad(page).getAttribute("data-shown"));
          if (focused) {
            if (shown !== focused) await clockTap(page, t, key(page, focused));
          } else {
            if (shown) {
              await clockTap(page, t, key(page, shown));
              await page.clock.runFor(301);
            }
          }
          await expect(pad(page)).toHaveAttribute("data-shown", String(focused));
          await clockDoubleTap(page, t, cell(page, 42));
          const expected = mode === "auto" && count === 1 ? 5 : focused;
          await expectValue(page, 42, expected);
          await expect(pad(page)).toHaveAttribute("data-shown", String(expected || focused));
          if (expected) {
            await expect(key(page, expected)).toHaveClass(/shown/);
            await expect(cell(page, 42)).toHaveClass(/same/);
            await clockTap(page, t, page.locator("#undo"));
            await page.clock.runFor(701);
            await expectValue(page, 42, 0);
            await expect(cell(page, 42)).toHaveAttribute("data-notes", desired);
          } else {
            await expect(cell(page, 42)).toHaveAttribute("data-notes", desired);
            await expect(cell(page, 42)).toHaveClass(/selected/);
          }
        }
      );
    }
  }
  test(
    `${mode}: a given stays locked on board double-tap`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      if (mode === "manual") await switchNotesMode(page);
      await clockTap(page, t, key(page, 3));
      await clockDoubleTap(page, t, cell(page, 1));
      await expectValue(page, 1, 5);
      await expect(cell(page, 1)).toHaveClass(/given/);
      await expect(cell(page, 1)).not.toHaveClass(/user/);
      await expect(page.locator("#undo")).toBeDisabled();
    }
  );
}

test("switching away from a keyboard lock clears its retained cell and old highlights", async ({
  page,
}) => {
  const t = await touchDriver(page);
  await t.tap(cell(page, 21));
  await page.keyboard.press("Shift+Digit2");
  await expect(cell(page, 21)).toHaveClass(/selected/);
  await t.tap(key(page, 4));
  await expect(pad(page)).toHaveAttribute("data-locked", "0");
  await expect(pad(page)).toHaveAttribute("data-shown", "4");
  await expect(page.locator(".cell.selected")).toHaveCount(0);
  await expect(page.locator('.cell.same:not([data-value="4"])')).toHaveCount(0);
  await expect(page.locator('.pencil-box.matching-number:not([data-d="4"])')).toHaveCount(0);
});

for (const gap of [299, 301]) {
  test(
    `Manual: selected digit board double-tap at ${gap} ms`,
    { tag: "@keypad-timing" },
    async ({ page }) => {
      const t = await touchDriver(page);
      await switchNotesMode(page);
      await clockTap(page, t, key(page, 3));
      await clockDoubleTap(page, t, cell(page, 42), gap);
      await expectValue(page, 42, gap < 300 ? 3 : 0);
      await expect(cell(page, 42)).toHaveClass(/selected/);
    }
  );
}

test("Manual: select cell then double-tap keypad overrides its lone note", async ({ page }) => {
  const t = await touchDriver(page);
  await switchNotesMode(page);
  await t.tap(cell(page, 42));
  await t.swipeUp(key(page, 5), 60);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "5");
  await t.tap(cell(page, 42));
  await t.doubleTap(key(page, 3));
  await expectValue(page, 42, 3);
  await expect(pad(page)).toHaveAttribute("data-shown", "3");
  await expect(cell(page, 42)).toHaveClass(/same/);
  await t.tap(page.locator("#undo"));
  await expectValue(page, 42, 0);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "5");
});

for (const mode of ["auto", "manual"]) {
  test(`${mode}: board double-tap preserves an existing answer`, async ({ page }) => {
    const t = await touchDriver(page);
    if (mode === "manual") await switchNotesMode(page);
    await t.tap(cell(page, 42));
    await t.doubleTap(key(page, 5));
    await expectValue(page, 42, 5);
    await t.tap(key(page, 3));
    await t.doubleTap(cell(page, 42));
    await expectValue(page, 42, 5);
    await t.tap(page.locator("#undo"));
    await expectValue(page, 42, 0);
    await expect(page.locator("#undo")).toBeDisabled();
  });
}
