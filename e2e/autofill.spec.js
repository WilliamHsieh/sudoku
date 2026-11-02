import { test, expect } from "@playwright/test";
import { openBoard, switchNotesMode, cell, solve, DEMO_PUZZLE } from "./helpers.js";

const status = (page) => page.locator('.play > [aria-live="polite"]');
const values = (page) =>
  page.locator(".board > .cell").evaluateAll((els) => els.map((el) => el.dataset.value));
async function bodyFocus(page) {
  await page.evaluate(() => document.activeElement?.blur());
}

// Safari may skip buttons during native Tab navigation. Keep these tests
// inside the page instead of focusing browser chrome and pausing the game.
async function keepTabInPage(page) {
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Native Tab target");
    input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px";
    document.body.append(input);
  });
}

// Resolve aliases through CSS, as dark tokens can point to other tokens.
async function expectToken(page, selector, property, token, pseudo = null) {
  const colors = await page
    .locator(selector)
    .first()
    .evaluate(
      (el, { property, token, pseudo }) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(el, pseudo)[property], expected };
      },
      { property, token, pseudo }
    );
  expect(colors.actual).toBe(colors.expected);
}

async function expectLegible(page, selector, background) {
  const colors = await page.locator(selector).evaluate(
    (el, background) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(document.querySelector(background)).backgroundColor,
    }),
    background
  );
  const luminance = (color) => {
    const rgb = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const s = n / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(colors.foreground),
    b = luminance(colors.background);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
}

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ page }) => {
      await openBoard(page);
    });

    test("dark fill controls, shortcut and toast use shared theme tokens and readable text", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator(".board")).toHaveCSS("background-color", "rgb(34, 38, 44)");
      if (width === 390) {
        await expectToken(page, ".af-chip", "color", "--ink");
        await expectToken(page, ".af-ic", "stroke", "--ink2");
        await expectToken(page, ".af-btn", "color", "--blue");
        await expectToken(page, ".af-btn", "backgroundColor", "--page");
        await expectToken(page, ".af-btn", "borderTopColor", "--hair");
        await expectLegible(page, ".af-msg", "body");
        await expectLegible(page, ".af-btn", ".af-btn");
      } else {
        await expectToken(page, ".af-desk", "color", "--blue");
        await expectToken(page, ".af-desk", "backgroundColor", "--board-bg");
        await expectToken(page, ".af-desk", "borderTopColor", "--hair");
        await expectToken(page, ".af-kbd", "color", "--ink2");
        await expectToken(page, ".af-kbd", "backgroundColor", "--neutral");
        await expectLegible(page, ".af-desk", ".af-desk");
        await expectLegible(page, ".af-kbd", ".af-kbd");
      }
      await bodyFocus(page);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      if (width === 1280) {
        await expect(page.locator(".af-desk")).toBeDisabled();
        await expectToken(page, ".af-desk", "color", "--ui-soft");
        await expectToken(page, ".af-desk", "backgroundColor", "--page");
        await expectLegible(page, ".af-desk", ".af-desk");
      }
      await page.keyboard.press("Tab");
      await expect(page.locator(".toast")).toBeVisible();
      await expectToken(page, ".toast", "color", "--on-accent");
      await expectToken(page, ".toast", "backgroundColor", "--primary");
      await expectLegible(page, ".toast", ".toast");
    });

    test("Auto controls, lock, pause, and other note modes", async ({ page }) => {
      const control = page.locator(width === 390 ? ".af-chip.active" : ".af-desk");
      await expect(control).toBeVisible();
      await expect(control).toContainText(
        width === 390 ? "4 cells have one candidate" : "Fill 4 single candidates"
      );
      await bodyFocus(page);
      await page.keyboard.press("Shift+Digit4");
      if (width === 390) await expect(page.locator(".af-chip.active")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("p");
      if (width === 390) await expect(page.locator(".af-chip.active")).toHaveCount(0);
      else await expect(control).toBeDisabled();
      await page.keyboard.press("p");
      await keepTabInPage(page);
      for (const mode of ["Tidy", "Manual"]) {
        await switchNotesMode(page, mode);
        await expect(page.locator(".af-chip, .af-desk")).toHaveCount(0);
        const before = await values(page);
        await bodyFocus(page);
        await page.keyboard.press("Tab");
        expect(await values(page)).toEqual(before);
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
      }
    });

    for (const focus of ["body", "board", "keypad"]) {
      test(`Tab from ${focus} fills once and keeps focus; Undo and Redo cover the pass`, async ({
        page,
      }) => {
        if (focus === "body") await bodyFocus(page);
        else
          await page
            .locator(focus === "board" ? ".board" : "#keypad .key")
            .first()
            .evaluate((el) => {
              if (!el.matches("button")) el.setAttribute("tabindex", "-1");
              el.focus();
            });
        await page.evaluate(() => {
          window.__autofillFocus = document.activeElement;
        });
        const before = await values(page);
        await page.keyboard.press("Tab");
        await expect(cell(page, 31)).toHaveAttribute("data-value", "2");
        const after = await values(page);
        expect(after.filter(Boolean).length - before.filter(Boolean).length).toBe(4);
        expect(await page.evaluate(() => document.activeElement === window.__autofillFocus)).toBe(
          true
        );
        await expect(status(page)).toHaveText("Filled 4 cells. r4c5 2, r4c9 1, r6c2 7, r6c5 5");
        await page.keyboard.press("Control+z");
        expect(await values(page)).toEqual(before);
        await expect(page.locator(".af-undone")).toHaveCount(4);
        await page.keyboard.press("Control+Shift+z");
        expect(await values(page)).toEqual(after);
      });
    }

    test("Shift+Tab, text controls, and the options dialog retain native Tab", async ({ page }) => {
      const before = await values(page);
      await keepTabInPage(page);
      await bodyFocus(page);
      await page.keyboard.press("Shift+Tab");
      expect(await values(page)).toEqual(before);
      const leftPage = await page.evaluate(() => !document.hasFocus());
      await page.evaluate(() => {
        const input = document.createElement("input");
        input.id = "tab-text";
        input.style.cssText = "position:fixed;top:0;left:0;width:80px";
        const next = document.createElement("input");
        next.id = "after-tab-text";
        next.style.cssText = "position:fixed;top:0;left:90px;width:80px";
        next.setAttribute("aria-label", "Next text control");
        document.body.prepend(input, next);
        input.focus();
      });
      // Reverse Tab can focus Safari's chrome. Finish its normal auto-resume
      // focus restoration before testing native traversal between the inputs.
      if (leftPage) await expect(page.locator("#time-control")).toBeFocused();
      await page.locator("#tab-text").focus();
      await page.keyboard.press("Tab");
      await expect(page.locator("#after-tab-text")).toBeFocused();
      expect(await values(page)).toEqual(before);
      await page.locator("[data-more]").filter({ visible: true }).click();
      await expect(page.locator("dialog[open]")).toBeVisible();
      await page.keyboard.press("Tab");
      expect(await values(page)).toEqual(before);
      expect(await page.evaluate(() => !!document.activeElement.closest("dialog"))).toBe(true);
    });

    test("N=0 toast, live region, disabled desktop button, and one-pass count", async ({
      page,
    }) => {
      await bodyFocus(page);
      await page.keyboard.press("Tab");
      if (width === 390) await expect(page.locator(".af-chip.active")).toContainText("2 cells");
      else await expect(page.locator(".af-desk")).toContainText("Fill 2 single candidates");
      await page.keyboard.press("Tab");
      if (width === 390) await expect(page.locator(".af-chip.active")).toHaveCount(0);
      else {
        await expect(page.locator(".af-desk")).toBeDisabled();
        await expect(page.locator(".af-desk")).toContainText("No single candidates");
      }
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.keyboard.press("Tab");
      await expect(page.locator(".toast")).toHaveText("No single candidates right now");
      await expect(status(page)).toHaveText("No cells with a single candidate.");
      await page.clock.runFor(1000);
      await page.keyboard.press("Tab");
      await page.clock.runFor(1000);
      await expect(page.locator(".toast")).toHaveCSS("opacity", "1");
      await page.clock.runFor(801);
      await expect(page.locator(".toast")).toHaveCount(0);
    });

    test("solved panel waits for the last stagger plus 520ms", async ({ page }) => {
      const solution = solve(DEMO_PUZZLE);
      const puzzle = "0" + solution.slice(1, 40) + "0" + solution.slice(41);
      await openBoard(page, `./?q=${puzzle}`);
      await bodyFocus(page);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.keyboard.press("Tab");
      await expect(page.locator(".af-filled")).toHaveCount(2);
      await expect(page.locator(".sv-panel")).toHaveCount(0);
      await page.clock.runFor(564);
      await expect(page.locator(".sv-panel")).toHaveCount(0);
      await page.clock.runFor(2);
      await expect(page.locator(".sv-panel")).toHaveCount(1);
    });

    test("reduced motion has no scale and no stagger", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await bodyFocus(page);
      await page.keyboard.press("Tab");
      const motion = await page.locator(".af-filled").evaluateAll((els) =>
        els.map((el) => ({
          delay: getComputedStyle(el, "::after").animationDelay,
          transform: getComputedStyle(el.querySelector(".pen-box")).transform,
          animation: getComputedStyle(el.querySelector(".pen-box")).animationName,
        }))
      );
      expect(motion).toHaveLength(4);
      for (const m of motion) {
        expect(m.delay).toBe("0s");
        expect(m.transform).toBe("none");
        expect(m.animation).toContain("af-ink-rm");
        expect(m.animation).not.toContain("af-in,");
      }
    });

    test("update notice takes priority over the phone chip", async ({ page }) => {
      const response = await page.request.get(
        "http://localhost:" + (process.env.PLAYWRIGHT_PORT || 4173) + "/sudoku/version.json"
      );
      const manifest = await response.json();
      manifest.version = "autofill-update";
      manifest.builtAt += 60_000;
      await page.route("**/version.json?*", (route) => route.fulfill({ json: manifest }));
      await page.clock.setSystemTime(new Date(Date.now() + 60_000));
      await page.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
      );
      const notice = page.locator(".update-notice.active").filter({ visible: true });
      await expect(notice).toHaveCSS("opacity", "1");
      if (width === 390) {
        await expect(page.locator(".af-chip.active")).toHaveCount(0);
        await expect(page.locator(".normal-hint")).toHaveAttribute("aria-hidden", "true");
        await notice.getByRole("button", { name: "Dismiss", exact: true }).click();
        await expect(page.locator(".af-chip.active")).toBeVisible();
      } else await expect(page.locator(".af-desk")).toBeVisible();
    });

    test("conflicting singles are tinted, announced, and left empty", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      // A distant given keeps the import valid without constraining cells 0 and 1.
      await openBoard(page, `./?q=${"0".repeat(80)}1`);
      for (const i of [0, 1]) {
        await cell(page, i).click();
        for (const d of [1, 2, 4, 5, 6, 7, 8, 9]) {
          await cell(page, i)
            .locator(`.pencil-box[data-d="${d}"]`)
            .evaluate((el) => el.click());
        }
      }
      await bodyFocus(page);
      await page.keyboard.press("Tab");
      await expect(status(page)).toHaveText(
        "Filled 0 cells · 2 skipped, they need the same digit."
      );
      await expect(page.locator(".af-skipped")).toHaveCount(2);
      await expectToken(page, ".af-skipped", "backgroundColor", "--conflict-bg", "::after");
      await expect(page.locator(".af-skipped").first()).toHaveCSS("--conflict", "#e6a8b5");
      await expect(cell(page, 0)).toHaveAttribute("data-value", "");
      await expect(cell(page, 1)).toHaveAttribute("data-value", "");
      await page.keyboard.press("Tab");
      await expect(page.locator(".af-skipped")).toHaveCount(2);
    });

    test("timer runs and a fill restarts the cue idle clock", async ({ page }) => {
      await page.clock.install();
      await openBoard(page);
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await bodyFocus(page);
      await page.clock.runFor(29_000);
      const before = await page.locator("[data-time]").filter({ visible: true }).textContent();
      await page.keyboard.press("Tab");
      await page.clock.runFor(1500);
      expect(await page.locator("[data-time]").filter({ visible: true }).textContent()).not.toBe(
        before
      );
      await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "idle");
      await page.clock.runFor(28_500);
      await expect(page.locator(".board")).toHaveAttribute("data-cue-phase", "flash");
    });

    test("pointer Fill closes the notes menu before filling", async ({ page }) => {
      await page
        .getByRole("button", { name: /^Notes mode:/ })
        .filter({ visible: true })
        .click();
      await expect(page.getByRole("menu", { name: "Notes", exact: true })).toBeVisible();
      await page.locator(width === 390 ? ".af-btn" : ".af-desk").click();
      await expect(cell(page, 31)).toHaveAttribute("data-value", "2");
      await expect(page.getByRole("menu", { name: "Notes", exact: true })).toHaveCount(0);
    });

    test("pointer Fill preserves the active control", async ({ page }) => {
      await bodyFocus(page);
      await page.locator(width === 390 ? ".af-btn" : ".af-desk").click();
      await expect(cell(page, 31)).toHaveAttribute("data-value", "2");
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    });
  });
}
