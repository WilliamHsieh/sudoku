import { test, expect } from "@playwright/test";
import { openBoard, cell, pencil, expectValue } from "./helpers.js";
import { puzzleData } from "../src/puzzles.js";
import { newGame, computedCandidates } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";

const trigger = (page) =>
  page.getByRole("button", { name: /^Notes mode:/ }).filter({ visible: true });
const menu = (page) => page.getByRole("menu", { name: "Notes", exact: true });
const item = (page, mode) =>
  menu(page).getByRole("menuitemradio", { name: new RegExp(`^${mode} `) });

async function choose(page, mode) {
  await trigger(page).click();
  await item(page, mode).click();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
}

for (const [width, height] of [
  [390, 844],
  [320, 568],
  [1280, 800],
]) {
  test.describe(`Notes modes at ${width}`, () => {
    test.use({ viewport: { width, height } });

    test("quiet control fits every mode and the popover has the specified geometry and copy", async ({
      page,
    }) => {
      await openBoard(page);
      const rects = [];
      for (const mode of ["Auto", "Tidy", "Manual"]) {
        if (mode !== "Auto") await choose(page, mode);
        await expect(trigger(page)).toHaveAccessibleName(`Notes mode: ${mode}`);
        await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
        await expect(trigger(page)).toHaveCSS("font-weight", "400");
        if (width < 600) {
          const boxes = await page.locator(".tools > button").evaluateAll((els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, w: r.width, h: r.height };
            })
          );
          expect(boxes).toHaveLength(5);
          for (const box of boxes) {
            expect(box.w).toBe(width === 390 ? 70 : 56);
            expect(box.h).toBe(52);
            expect(box.y).toBe(boxes[0].y);
          }
          rects.push(boxes);
          const label = trigger(page).locator(".mode-label");
          await expect(label).toHaveCSS("white-space", "nowrap");
          expect(await label.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
            width === 390 ? 66 : 52
          );
          await expect(label).toHaveCSS("font-size", "12px");
        } else {
          const geometry = await trigger(page).boundingBox();
          expect(geometry.height).toBe(30);
          if (mode === "Auto") expect(geometry.width).toBe(86);
          const order = await page
            .locator(".header")
            .evaluate((el) =>
              [...el.children]
                .filter((e) => e.tagName === "BUTTON")
                .map((e) => e.getAttribute("aria-label"))
            );
          expect(order).toEqual(["Pause", `Notes mode: ${mode}`, "More"]);
        }
        await trigger(page).click();
        await expect(menu(page)).toHaveAccessibleName("Notes");
        await expect(menu(page).getByRole("menuitemradio")).toHaveCount(3);
        await expect(item(page, mode)).toHaveAttribute("aria-checked", "true");
        expect(await menu(page).locator('[aria-checked="true"]').count()).toBe(1);
        for (const text of [
          "Candidates filled in for you",
          "Your notes, tidied as you place",
          "Your notes, never changed",
        ])
          await expect(menu(page).getByText(text)).toBeVisible();
        // Wait for the transform to settle before measuring the anchored rectangle.
        await menu(page).evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const box = await menu(page).boundingBox();
        expect(box.width).toBe(280);
        expect(box.x).toBeGreaterThanOrEqual(12);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
        const anchor = await trigger(page).boundingBox();
        if (width < 600) {
          expect(box.x).toBe(width === 390 ? 98 : 28);
          expect(box.y + box.height).toBeCloseTo(anchor.y - 8, 1);
        } else expect(box.y).toBeCloseTo(anchor.y + anchor.height + 8, 1);
        for (const h of await menu(page)
          .getByRole("menuitemradio")
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height)))
          expect(h).toBe(53);
        await page.keyboard.press("Escape");
        await expect(trigger(page)).toBeFocused();
        await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
      }
      if (width < 600) expect(rects).toEqual([rects[0], rects[0], rects[0]]);

      // Wider platform fallback metrics must not resize the toolbar or clip a label.
      await page.addStyleTag({ content: ".notes-mode { font-family: monospace !important; }" });
      for (const mode of ["Auto", "Tidy", "Manual"]) {
        await choose(page, mode);
        if (width < 600) {
          const cells = await page
            .locator(".tools > button")
            .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
          expect(cells).toEqual(Array(5).fill(width === 390 ? 70 : 56));
          expect(
            await trigger(page)
              .locator(".mode-label")
              .evaluate((el) => el.scrollWidth)
          ).toBeLessThanOrEqual(width === 390 ? 66 : 52);
        } else if (mode !== "Manual") expect((await trigger(page).boundingBox()).width).toBe(86);
      }
    });

    test("keyboard, outside taps, focus, and pause", async ({ page }) => {
      await openBoard(page);
      await trigger(page).focus();
      for (const key of ["Enter", "Space"]) {
        await page.keyboard.press(key);
        await expect(item(page, "Auto")).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(item(page, "Manual")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(item(page, "Auto")).toBeFocused();
        await page.keyboard.press("End");
        await expect(item(page, "Manual")).toBeFocused();
        await page.keyboard.press("Home");
        await expect(item(page, "Auto")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(item(page, "Tidy")).toBeFocused();
        await page.keyboard.press(key);
        await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
        await expect(trigger(page)).toBeFocused();
        await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
        await choose(page, "Auto");
      }
      await trigger(page).click();
      await page.keyboard.press("Tab");
      await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("[data-more]").filter({ visible: true })).toBeFocused();
      await trigger(page).click();
      await page.mouse.click(2, height - 2);
      await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
      await expect(trigger(page)).toBeFocused();
      await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
      await trigger(page).click();
      await page.locator("#pause").click();
      await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
      await expect(trigger(page)).toBeDisabled();
      await expect(page.locator(".notes-menu:popover-open")).toHaveCount(0);
      await expect(page.locator("#resume")).toBeFocused();
    });

    for (const reducedMotion of ["no-preference", "reduce"]) {
      test(`motion and choose delay: ${reducedMotion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion });
        const now = new Date("2026-10-24T00:00:00Z");
        await page.clock.install({ time: now });
        await page.clock.pauseAt(new Date(now.getTime() + 1000));
        await openBoard(page);
        await trigger(page).evaluate((el) => el.click());
        const timing = await menu(page).evaluate((el) => ({
          animations: el.getAnimations().map((a) => ({
            duration: a.effect.getTiming().duration,
            easing: a.effect.getTiming().easing,
            frames: a.effect.getKeyframes(),
          })),
          transition: getComputedStyle(el).transitionDuration,
        }));
        if (reducedMotion === "reduce") {
          expect(timing.animations).toEqual([]);
          expect(timing.transition).toBe("0s");
        } else {
          expect(timing.animations[0].duration).toBe(260);
          expect(timing.animations[0].easing).toBe("cubic-bezier(0.22, 0.8, 0.24, 1)");
          expect(timing.animations[0].frames[0].opacity).toBe("0");
          expect(timing.animations[0].frames[0].transform).toContain("scale(0.96)");
        }
        // Record the actual aria-expanded change, avoiding polling quantisation.
        await page.evaluate(() => {
          const button = [...document.querySelectorAll(".notes-mode")].find(
            (el) => el.getBoundingClientRect().width > 0
          );
          window.__modeClose = { start: 0, elapsed: null };
          const observer = new MutationObserver(() => {
            if (button.getAttribute("aria-expanded") === "false") {
              window.__modeClose.elapsed = performance.now() - window.__modeClose.start;
              observer.disconnect();
            }
          });
          observer.observe(button, { attributes: true, attributeFilter: ["aria-expanded"] });
          window.__modeClose.start = performance.now();
          document.querySelector('[role="menuitemradio"]:nth-of-type(2)').click();
        });
        await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
        if (reducedMotion === "no-preference")
          await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
        if (reducedMotion === "no-preference") {
          await page.clock.runFor(119);
          await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
          await page.clock.runFor(1);
        }
        await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
        const delay = await page.evaluate(() => window.__modeClose.elapsed);
        if (reducedMotion === "reduce") {
          expect(delay).toBeLessThan(100);
          expect(
            await page
              .locator(".notes-menu")
              .evaluateAll((els) => els.flatMap((el) => el.getAnimations({ subtree: true })).length)
          ).toBe(0);
        } else {
          expect(delay).toBeGreaterThanOrEqual(115);
          expect(delay).toBeLessThan(250);
        }
      });
    }
  });
}

test("Tidy cleanup, undo rings, reload, Journal return, restart, and new puzzle default", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const date = "2025-06-01";
  const difficulty = "easy";
  const state = newGame(puzzleData[date][difficulty], { notesMode: "tidy" });
  state.manualNotes = Array.from({ length: 81 }, (_, i) => computedCandidates(state, i));
  const snapshot = toSnapshot(state);
  await page.addInitScript(
    ({ date, difficulty, snapshot }) => {
      if (!localStorage.getItem("sudoku-progress"))
        localStorage.setItem(
          "sudoku-progress",
          JSON.stringify({
            [date]: {
              [difficulty]: { elapsed: 10, filled: 0, empty: 50, updatedAt: Date.now(), snapshot },
            },
          })
        );
      localStorage.setItem("sudoku-keypad-coach", "1");
    },
    { date, difficulty, snapshot }
  );
  await page.goto("./");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
  // r1c7 has 4 and shares a row with r1c8.
  const target = 6;
  const digit = Number(snapshot.manualNotes[target][0]);
  const peer = snapshot.manualNotes.findIndex(
    (notes, i) => i !== target && i < 9 && notes.includes(String(digit))
  );
  expect(peer).toBeGreaterThanOrEqual(0);
  await expect(pencil(page, peer, digit)).not.toHaveClass(/invisible/);
  await cell(page, target).click();
  await page.keyboard.press(String(digit));
  await expectValue(page, target, digit);
  await expect(pencil(page, peer, digit)).toHaveClass(/invisible/);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.locator("#undo").evaluate((el) => el.click());
  await page.clock.runFor(350);
  await expect(cell(page, peer)).toHaveClass(/undo-target/);
  await expectValue(page, target, 0);
  await page.clock.resume();
  await expect(pencil(page, peer, digit)).not.toHaveClass(/invisible/);
  await choose(page, "Manual");
  await choose(page, "Tidy");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-progress")));
  expect(saved[date][difficulty].snapshot.notesMode).toBe("tidy");
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
  await page.locator("[data-more]").filter({ visible: true }).click();
  await page.locator("#opt-restart").click();
  await page.locator("#confirm-ok").click();
  await expect(trigger(page)).toHaveAccessibleName("Notes mode: Tidy");
  await openBoard(page);
  await expect(trigger(page)).toHaveAccessibleName("Notes mode: Auto");
});
