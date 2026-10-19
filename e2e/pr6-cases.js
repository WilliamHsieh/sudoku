// Pause, More/Options, Restart, and the single-candidate cue.
import { test, expect } from "@playwright/test";
import {
  cell,
  expectValue,
  DEMO_PUZZLE,
  expectGapsAtLeast,
  measureChipLineGaps,
  solve,
} from "./helpers.js";

const T0 = new Date("2026-01-01T00:00:00Z");

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ mobile?: boolean }} [opts]
 */
async function openPlay(page) {
  await page.addInitScript(() => localStorage.removeItem("sudoku-cue"));
  await page.clock.install({ time: T0 });
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  if ((await page.locator(".board > .cell").count()) === 0) {
    await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
  }
  await expect(page.locator(".board > .cell")).toHaveCount(81);
}

/** @param {import('@playwright/test').Page} page */
function moreButton(page) {
  return page.locator("[data-more]").filter({ visible: true });
}

/** @param {import('@playwright/test').Page} page */
async function loneIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".board > .cell")]
      .filter((el) => {
        const shown = [...el.querySelectorAll(".pencil-box")].filter(
          (n) => !n.classList.contains("invisible")
        );
        return shown.length === 1;
      })
      .map((el) => Number(el.dataset.i))
  );
}

/** @param {import('@playwright/test').Page} page */
async function cueIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".pencil-box.cue")].map((el) =>
      Number(el.closest(".cell")?.dataset.i)
    )
  );
}

/** @param {import('@playwright/test').Page} page @param {boolean} hidden */
async function setTabHidden(page, hidden) {
  await page.evaluate((flag) => {
    const doc = document;
    if (!doc.__pr6Vis) {
      let current = false;
      Object.defineProperty(doc, "hidden", { configurable: true, get: () => current });
      Object.defineProperty(doc, "visibilityState", {
        configurable: true,
        get: () => (current ? "hidden" : "visible"),
      });
      doc.__pr6Vis = (next) => {
        current = next;
        doc.dispatchEvent(new Event("visibilitychange"));
      };
    }
    doc.__pr6Vis(flag);
  }, hidden);
}

/**
 * @param {{ mobile?: boolean }} [opts]
 */
export function registerPr6Tests(opts = {}) {
  const mobile = !!opts.mobile;

  test.beforeEach(async ({ page }) => {
    await openPlay(page);
  });

  test("the desktop timer chip is 30px tall", async ({ page }) => {
    test.skip(mobile, "desktop header");
    const timer = page.locator(".timer");
    await expect(timer).toHaveCSS("padding-top", "6px");
    await expect(timer).toHaveCSS("padding-right", "10px");
    expect((await timer.boundingBox()).height).toBe(30);
  });

  test("the cue pulses every lone candidate together and selection resets it", async ({ page }) => {
    const lones = await loneIds(page);
    expect(lones.length).toBeGreaterThan(1);

    await page.clock.runFor(20_000);
    await cell(page, 0).click();
    await page.clock.runFor(29_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);

    await page.clock.runFor(1_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
    expect(await cueIds(page)).toEqual(lones);
  });

  test("the cue stays off while paused or a dialog is open, then starts over", async ({ page }) => {
    await page.clock.runFor(10_000);
    await page.locator("#pause").click();
    await page.clock.runFor(40_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);

    await page.locator("#resume").click();
    await page.clock.runFor(29_000);
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);
    await page.clock.runFor(1_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");

    await page.locator(".pencil-box.cue").first().waitFor();
    await moreButton(page).click();
    await expect(page.locator("dialog.opts")).toBeVisible();
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await page.clock.runFor(40_000);
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);

    await page.locator("#opts-done").click();
    await expect(page.locator("dialog.opts")).toBeHidden();
    await page.clock.runFor(29_000);
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);
    await page.clock.runFor(1_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
  });

  test("Manual notes disable the cue and keep the saved choice", async ({ page }) => {
    // Desktop has no notes control in the header. The mobile switch is in the DOM
    // either way; a script click toggles it when the row is not on screen.
    await page
      .locator("#notes-mode")
      .evaluate((el) => /** @type {HTMLButtonElement} */ (el).click());
    await expect(page.locator("#notes-mode")).toHaveAttribute("aria-checked", "false");
    await moreButton(page).click();
    const cue = page.locator("#opt-cue");
    await expect(cue).toBeDisabled();
    await expect(cue).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("#cue-why")).toBeVisible();
    await expect(page.locator("#cue-why")).toHaveText("Needs Auto notes. Your choice is kept.");
    await page.locator("#opts-done").click();

    await page.clock.runFor(40_000);
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");

    await page
      .locator("#notes-mode")
      .evaluate((el) => /** @type {HTMLButtonElement} */ (el).click());
    await moreButton(page).click();
    await expect(page.locator("#opt-cue")).toBeEnabled();
    await expect(page.locator("#opt-cue")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#cue-desc")).toBeVisible();
  });

  test("the cue peak tints every lone candidate with the ink digit and a 3px ring", async ({
    page,
  }) => {
    await page.clock.runFor(30_000);
    const chips = page.locator(".pencil-box.cue");
    expect(await chips.count()).toBeGreaterThan(1);
    await chips.evaluateAll((els) => {
      for (const el of els) {
        for (const anim of el.getAnimations()) {
          anim.pause();
          anim.currentTime = 270;
        }
      }
    });
    const looks = await chips.evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          weight: cs.fontWeight,
          shadow: cs.boxShadow,
        };
      })
    );
    for (const look of looks) {
      expect(look.bg).toBe("rgb(214, 243, 223)");
      expect(look.color).toBe("rgb(22, 101, 52)");
      expect(look.weight).toBe("600");
      expect(look.shadow).toBe(
        "rgb(34, 197, 94) 0px 0px 0px 1px, rgba(34, 197, 94, 0.28) 0px 0px 0px 3px"
      );
    }
    expectGapsAtLeast(await measureChipLineGaps(page, ".pencil-box.cue"), 1);
  });

  test("the cue stays idle after the puzzle is solved", async ({ page }) => {
    const solution = solve(DEMO_PUZZLE);
    const digits = solution.split("");
    const blank = [...DEMO_PUZZLE].findIndex((ch) => ch === "0");
    const digit = digits[blank];
    digits[blank] = "0";
    await page.goto(`./?q=${digits.join("")}&cueMs=700`);
    if ((await page.locator(".board > .cell").count()) === 0) {
      await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
    }
    await cell(page, blank).click();
    await page.keyboard.press(digit);
    await expect(page.locator(".success-card")).toBeVisible();
    await page.clock.runFor(2_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);
  });

  test("the r9c3 cue ring stays 1px off the box line", async ({ page }) => {
    await page.goto("./?shot=1&freeze&cueMs=250");
    await page.clock.runFor(1_000);
    const six = page.locator('.cell[data-i="74"] .pencil-box.cue');
    await expect(six).toHaveCount(1);
    await six.evaluate((el) => {
      for (const anim of el.getAnimations()) {
        anim.pause();
        anim.currentTime = 270;
      }
    });
    const gaps = await measureChipLineGaps(page, ".pencil-box.cue");
    expectGapsAtLeast(gaps, 1);
    expect(gaps.find((g) => g.i === 74 && g.d === 6)?.min).toBeGreaterThanOrEqual(1);
  });

  test("reduced motion holds a static tint with no ring until the next input", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    if ((await page.locator(".board > .cell").count()) === 0) {
      await page.getByRole("button", { name: /Play|Back to puzzle/ }).click();
    }
    await expect(page.locator(".board > .cell")).toHaveCount(81);

    await page.clock.runFor(30_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "hold");
    const chip = page.locator(".pencil-box.cue").first();
    await expect(chip).toBeVisible();
    const look = await chip.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        animation: cs.animationName,
        shadow: cs.boxShadow,
        bg: cs.backgroundColor,
        color: cs.color,
      };
    });
    expect(look.animation).toBe("none");
    expect(look.bg).toBe("rgb(214, 243, 223)");
    expect(look.color).toBe("rgb(22, 101, 52)");
    expect(look.shadow).toBe("rgb(34, 197, 94) 0px 0px 0px 1px");

    await page.clock.runFor(60_000);
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "hold");
    await cell(page, 0).click();
    await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
    await expect(page.locator(".pencil-box.cue")).toHaveCount(0);
  });

  test("pause stops the clock and hides the board; resume continues", async ({ page }) => {
    await page.clock.runFor(3_000);
    await expect(page.locator(".timer .time")).toHaveText("0:03");
    await page.locator("#pause").click();
    await expect(page.locator(".paused-cover")).toBeVisible();
    await expect(page.locator(".paused-kicker")).toHaveText("Paused");
    await expect(page.locator(".paused-line")).toHaveText(
      "The board is hidden and the clock is stopped."
    );
    await expect(page.locator("#resume")).toBeFocused();
    await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#pause")).toHaveAttribute("aria-label", "Resume");
    await expect(page.locator(".board")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".board")).toHaveAttribute("inert", "");
    await expect(page.locator(".chrome-dim")).toHaveAttribute("inert", "");
    if (mobile) {
      await expect(page.locator(".chrome-dim")).toHaveCSS("opacity", "0.4");
    }
    await page.clock.runFor(5_000);
    await expect(page.locator(".timer .time")).toHaveText("0:03");
    await expect(page.locator(".paused-time")).toHaveText("0:03");

    await page.locator("#resume").click();
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    await expect(page.locator("#pause")).toBeFocused();
    await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "false");
    await page.clock.runFor(2_000);
    await expect(page.locator(".timer .time")).toHaveText("0:05");
  });

  test("P toggles pause and ignores modifiers and open dialogs", async ({ page }) => {
    await page.keyboard.press("Shift+P");
    await page.keyboard.press("Control+P");
    await page.keyboard.press("Alt+P");
    await expect(page.locator(".paused-cover")).toHaveCount(0);

    await page.keyboard.press("p");
    await expect(page.locator(".paused-cover")).toBeVisible();
    await expect(page.locator("#resume")).toBeFocused();
    await page.keyboard.press("p");
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    await expect(page.locator("#pause")).toBeFocused();

    await moreButton(page).click();
    await expect(page.locator("dialog.opts")).toBeVisible();
    await page.keyboard.press("p");
    await expect(page.locator(".paused-cover")).toHaveCount(0);
    await expect(page.locator("dialog.opts")).toBeVisible();
  });

  test("hiding the tab pauses and showing it does not resume", async ({ page }) => {
    await page.clock.runFor(2_000);
    await expect(page.locator(".timer .time")).toHaveText("0:02");
    await setTabHidden(page, true);
    await expect(page.locator(".paused-cover")).toBeVisible();
    await setTabHidden(page, false);
    await expect(page.locator(".paused-cover")).toBeVisible();
    await page.clock.runFor(4_000);
    await expect(page.locator(".timer .time")).toHaveText("0:02");
    if (mobile) await expect(page.locator(".chrome-dim")).toHaveAttribute("inert", "");
    else await expect(moreButton(page)).toBeDisabled();
  });

  test("restart confirms, Cancel and Esc return to the sheet, Restart clears the puzzle", async ({
    page,
  }) => {
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await expectValue(page, 0, 4);
    await page.clock.runFor(4_000);
    await expect(page.locator(".timer .time")).toHaveText("0:04");

    await moreButton(page).click();
    await expect(page.locator("#opt-cue")).toBeFocused();
    await page.locator("#opt-restart").click();
    await expect(page.locator("dialog.opts")).toBeHidden();
    await expect(page.locator("dialog.confirm")).toBeVisible();
    await expect(page.locator("#confirm-title")).toHaveText("Restart this puzzle?");
    await expect(page.locator("#confirm-body")).toHaveText(
      "This clears your answers, notes and the time. Undo can’t bring them back."
    );
    await expect(page.locator("#confirm-cancel")).toBeFocused();

    await page.locator("#confirm-cancel").click();
    await expect(page.locator("dialog.confirm")).toBeHidden();
    await expect(page.locator("dialog.opts")).toBeVisible();
    await expect(page.locator("#opt-restart")).toBeFocused();

    await page.locator("#opt-restart").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.opts")).toBeVisible();
    await expect(page.locator("#opt-restart")).toBeFocused();
    await expectValue(page, 0, 4);

    await page.locator("#opt-restart").click();
    await page.locator("#confirm-ok").click();
    await expect(page.locator("dialog.confirm")).toBeHidden();
    await expect(page.locator("dialog.opts")).toBeHidden();
    await expectValue(page, 0, 0);
    await expect(page.locator(".timer .time")).toHaveText("0:00");
    await expect(page.locator(".cell.selected")).toHaveCount(0);
    await expect(page.locator("#undo")).toBeDisabled();
    await expect(moreButton(page)).toBeFocused();
  });

  test("More is unavailable while paused and Done restores focus", async ({ page }) => {
    await page.locator("#pause").click();
    if (mobile) {
      await page.locator(".tools [data-more]").click({ force: true });
    }
    await expect(page.locator("dialog.opts")).toBeHidden();
    await page.locator("#resume").click();
    await moreButton(page).click();
    await expect(page.getByRole("heading", { name: "Options" })).toBeVisible();
    await page.locator("#opts-done").click();
    await expect(moreButton(page)).toBeFocused();
  });
}
