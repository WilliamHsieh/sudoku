import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { puzzleData } from "../src/puzzles.js";
import { newGame, setAnswer } from "../src/game/game.js";
import { toSnapshot } from "../src/game/snapshot.js";
import { solve } from "./helpers.js";

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer();
    await use(server);
    await server.close();
  },
});
test.use({ hasTouch: true });

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"]) {
    for (const action of ["update", "dismiss"])
      test(`pending update survives solving: ${action} at ${width}px in ${theme}`, async ({
        page,
        deployment,
      }, testInfo) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.emulateMedia({ colorScheme: theme });
        const date = "2026-11-01";
        const puzzle = puzzleData[date].easy;
        const solution = solve(puzzle);
        const empty = [...puzzle].flatMap((d, i) => (d === "0" ? [i] : []));
        const last = empty.at(-1);
        let state = newGame(puzzle, { notesMode: "auto" });
        for (const i of empty)
          if (i !== last) state = setAnswer(state, i, Number(solution[i])).state;
        await page.addInitScript(
          ({ date, snapshot, count, theme }) => {
            localStorage.setItem(
              "sudoku-progress",
              JSON.stringify({
                [date]: {
                  easy: { snapshot, elapsed: 402, filled: count - 1, empty: count, updatedAt: 100 },
                },
              })
            );
            localStorage.setItem("sudoku-keypad-coach", "1");
            localStorage.setItem("sudoku-theme", theme);
          },
          { date, snapshot: toSnapshot(state), count: empty.length, theme }
        );
        await page.goto(deployment.url);
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page
          .locator(".play")
          .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        await page.clock.setSystemTime(new Date(Date.now() + 60_000));
        deployment.publish();
        await page.evaluate(() =>
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
        );
        const notice = page.locator(".update-notice.active");
        await expect(notice).toHaveCSS("opacity", "1");
        await page.locator(`.cell[data-i="${last}"]`).click();
        await page.keyboard.press(solution[last]);
        await expect(page.locator("#sv-h")).toBeFocused();
        await expect(page.locator(".game-controls")).toHaveCount(0);
        await expect(notice).toHaveCount(1);
        await expect(notice).toHaveClass(/pill/);
        await expect(notice).toHaveCSS("opacity", "1");
        expect(await notice.evaluate((el) => !!el.closest("[inert]"))).toBe(false);
        const button = notice.getByRole("button", { name: "Update", exact: true });
        const centre = await button.boundingBox();
        expect(
          await page.evaluate(
            ({ x, y }) =>
              document
                .elementFromPoint(x, y)
                ?.closest(".update-notice")
                ?.classList.contains("active"),
            { x: centre.x + centre.width / 2, y: centre.y + centre.height / 2 }
          )
        ).toBe(true);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const saved = await page.evaluate(() => localStorage.getItem("sudoku-solved"));
        await page
          .locator(".sv-panel")
          .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        if (action === "update") {
          if (process.env.SOLVED_UPDATE_EVIDENCE && testInfo.project.name === "upgrade-chromium")
            await page.screenshot({
              path: `${process.env.SOLVED_UPDATE_EVIDENCE}/solved-update-${width}x${width === 390 ? 844 : 800}-${theme}-chromium.png`,
            });
          if (width === 390) await button.tap();
          else await button.click();
          await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "new");
          await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
          expect(await page.evaluate(() => localStorage.getItem("sudoku-solved"))).toBe(saved);
        } else {
          // More no longer exists after solve; dismissal must restore heading focus.
          const dismiss = notice.getByRole("button", { name: "Dismiss", exact: true });
          await dismiss.focus();
          await page.keyboard.press("Enter");
          await expect(page.locator("#sv-h")).toBeFocused();
          await expect(page.locator(".update-notice.active")).toHaveCount(0);
        }
      });
  }
}
