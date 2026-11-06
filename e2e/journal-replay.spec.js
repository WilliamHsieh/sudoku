import { test, expect } from "@playwright/test";
import { fmtTime } from "../src/journal/format.js";
import {
  REPLAY_DATE,
  replayPuzzle,
  replayAnswer,
  seedReplay,
  openReplayDay,
  startReplay,
  showSolvedRow,
  readReplayStorage,
  replayEntry,
} from "./replay-fixtures.js";
async function expectLayout(page, width, inProgress) {
  const boxes = await page.locator(".actions button").evaluateAll((es) =>
    es.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );
  const journal = boxes.find((b) => b.text === "Journal"),
    replay = boxes.find((b) => b.text === "Replay");
  expect(journal.h).toBeCloseTo(48, 1);
  expect(replay.h).toBeCloseTo(width === 390 || inProgress ? 48 : 56, 1);
  if (width === 390) {
    expect(Math.abs(journal.w - replay.w)).toBeLessThan(1);
    expect(Math.abs(journal.y - replay.y)).toBeLessThan(0.1);
  } else {
    expect(replay.y).toBeLessThan(journal.y);
    const group = await page.locator(".sv-view-panel .group").boundingBox(),
      board = await page.locator(".board").boundingBox();
    expect(group.width).toBeCloseTo(236, 1);
    expect(Math.abs(group.y + group.height / 2 - board.y - board.height / 2)).toBeLessThan(1);
  }
  if (inProgress) {
    const resume = await page.locator(".resume").boundingBox();
    expect(resume.height).toBeCloseTo(40, 1);
    if (width === 1280) expect(resume.width).toBeCloseTo(210, 1);
  }
}
for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    });
    test(`S1 remains read-only and starts the first replay at ${width}`, async ({ page }) => {
      await seedReplay(page);
      await openReplayDay(page);
      const before = await readReplayStorage(page);
      await expectLayout(page, width, false);
      await expect(page.getByRole("button", { name: "Hint", exact: true })).toHaveCount(0);
      await expect(page.locator("#sv-h")).toHaveText("Solved Oct 31 at 9:14 PM");
      await expect(page.locator(".hero")).toHaveText("6:42");
      await expect(page.locator("#time-control")).toHaveAttribute(
        "aria-label",
        "Solved in 6:42 on October 31"
      );
      await expect(page.locator(".summary")).toHaveText("Easy · 1:37 faster than average");
      await expect(page.locator("#sv-rn")).toHaveText(
        "Your 6:42 stays saved until you finish a replay."
      );
      await expect(page.locator("#sv-replay")).toHaveClass(/primary/);
      await expect(page.locator(".replay-card,#keypad,.game-controls,.sv-ring")).toHaveCount(0);
      const values = await page
        .locator(".cell")
        .evaluateAll((es) => es.map((e) => e.getAttribute("data-value")));
      for (const key of ["1", "ArrowRight", "Backspace", "Control+z", "p"])
        await page.keyboard.press(key);
      await page.locator(".cell").first().dispatchEvent("click");
      expect(
        await page.locator(".cell").evaluateAll((es) => es.map((e) => e.getAttribute("data-value")))
      ).toEqual(values);
      await page.locator("#sv-replay").click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toHaveAccessibleName("Replay this puzzle?");
      await expect(dialog.locator("p")).toHaveText(
        "You'll start from a fresh board at 0:00. Your 6:42 stays saved, and is replaced only if you finish."
      );
      await page.keyboard.press("Escape");
      await expect(page.locator("#sv-replay")).toBeFocused();
      await startReplay(page);
      await expect(page.locator("[data-time]")).toHaveText("0:00");
      expect((await readReplayStorage(page)).solved).toBe(before.solved);
      await page
        .getByRole("button", { name: "More", exact: true })
        .filter({ visible: true })
        .click();
      await expect(page.locator("#opt-restart")).toHaveCount(0);
      await page.keyboard.press("Escape");
    });
    test(`S2 survives leave/reload and Resume restores grid notes and elapsed time at ${width}`, async ({
      page,
    }) => {
      await seedReplay(page, { withReplay: true });
      await openReplayDay(page);
      const before = await readReplayStorage(page),
        entry = replayEntry();
      const card = page.getByRole("group", { name: "Replay in progress", exact: true });
      await expect(card).toBeVisible();
      await expectLayout(page, width, true);
      await expect(page.getByRole("button", { name: "Hint", exact: true })).toHaveCount(0);
      await expect(card).toContainText(
        `2:13 played · ${Math.round((100 * entry.filled) / entry.empty)}% filled`
      );
      await expect(page.locator("#sv-rn")).toHaveText(
        "Your 6:42 stays saved until you finish the replay."
      );
      await expect(page.locator("#sv-replay")).toHaveClass(/quiet/);
      await expect(page.locator("#sv-replay")).toHaveAttribute("aria-haspopup", "dialog");
      await expect(page.locator("[data-time]")).toHaveText("6:42");
      await card.getByRole("button", { name: "Resume replay, 2:13 played", exact: true }).click();
      await expect(page.locator(".board .cell.user")).toHaveCount(entry.filled);
      await expect(page.locator(".board")).toHaveAttribute("data-notes-mode", "manual");
      const noteCell = entry.snapshot.manualNotes.findIndex((s) => s !== "");
      await expect(page.locator(`.cell[data-i="${noteCell}"]`)).toHaveAttribute(
        "data-notes",
        entry.snapshot.manualNotes[noteCell]
      );
      const time = await page.locator("[data-time]").innerText();
      expect(time).toMatch(/^2:1[3-9]$/);
      await page.locator(".header .dbtn").click();
      await page.reload();
      await openReplayDay(page);
      await expect(card).toBeVisible();
      await expect(page.locator("[data-time]")).toHaveText("6:42");
      expect((await readReplayStorage(page)).solved).toBe(before.solved);
      await page.getByRole("button", { name: "Journal", exact: true }).click();
      await page.getByRole("button", { name: "Back to game", exact: true }).click();
      await expect(card).toBeVisible();
    });
    test(`closing the app checkpoints replay progress at ${width}`, async ({ page }) => {
      await seedReplay(page, { withReplay: true });
      await openReplayDay(page);
      const before = await readReplayStorage(page);
      await page.getByRole("button", { name: "Resume replay, 2:13 played" }).click();
      const blank = await page.locator('.cell[data-value=""]').first().getAttribute("data-i");
      await page.locator(`.cell[data-i="${blank}"]`).click();
      await page.keyboard.press(replayAnswer[Number(blank)]);
      await page.waitForTimeout(1100);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
      const saved = await readReplayStorage(page),
        entry = JSON.parse(saved.replay)[REPLAY_DATE].easy;
      expect(entry.elapsed).toBeGreaterThan(133);
      expect(entry.filled).toBe(replayEntry().filled + 1);
      expect(saved.solved).toBe(before.solved);
      await page.reload();
      await openReplayDay(page);
      await expect(page.locator(".replay-card")).toBeVisible();
    });
    test(`S3 Cancel Escape focus and start-over preserve the record at ${width}`, async ({
      page,
    }) => {
      await seedReplay(page, { withReplay: true });
      await openReplayDay(page);
      const before = await readReplayStorage(page);
      const replay = page.locator("#sv-replay"),
        dialog = page.getByRole("alertdialog");
      await replay.click();
      await expect(dialog).toHaveAccessibleName("Start the replay over?");
      await expect(dialog.locator("p")).toHaveText(
        "Your replay at 2:13 will be cleared and you'll start again from 0:00. Your 6:42 stays saved."
      );
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(page.locator("header")).toHaveAttribute("inert", "");
      await expect(page.locator(".play")).toHaveAttribute("inert", "");
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: "Start over" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(replay).toBeFocused();
      expect(await readReplayStorage(page)).toEqual(before);
      await replay.click();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(replay).toBeFocused();
      expect(await readReplayStorage(page)).toEqual(before);
      await replay.click();
      await dialog.getByRole("button", { name: "Start over" }).click();
      await expect(page.locator("[data-time]")).toHaveText("0:00");
      await expect(page.locator(".board .cell.user")).toHaveCount(0);
      await expect(page.locator(".board")).toHaveAttribute("data-notes-mode", "auto");
      const after = await readReplayStorage(page),
        entry = JSON.parse(after.replay)[REPLAY_DATE].easy;
      expect(after.solved).toBe(before.solved);
      expect(entry.elapsed).toBe(0);
      expect(entry.snapshot.manualNotes.every((x) => x === "")).toBe(true);
    });
    test(`M1 marks calendar latest legend rows and Unfinished at ${width}`, async ({ page }) => {
      await seedReplay(page, { withReplay: true, otherReplay: true });
      const scope = page.locator(width === 390 ? ".journal .mobile" : ".journal .desktop");
      const day = scope.getByRole("button", {
        name: /Saturday, October 31.*Easy solved, replay in progress/,
      });
      await expect(day).toBeVisible();
      const dot = day.locator(".replay-dot");
      await expect(dot).toHaveAttribute("r", width === 390 ? "1.75" : "2.1");
      await expect(dot).toHaveAttribute("fill", "var(--same-digit)");
      const rect = day.locator("svg.mk rect").first();
      await expect(rect).toHaveAttribute("fill", "var(--ink)");
      await expect(rect).toHaveAttribute("stroke", "none");
      const legend = scope.locator(".legend > span");
      const labels = await legend.allTextContents();
      expect(labels.indexOf("Replaying")).toBe(labels.indexOf("In progress") + 1);
      if (width === 390) {
        await expect(page.locator(".latest .replay-dot")).toBeVisible();
        await expect(page.getByRole("button", { name: "Unfinished puzzles, 2" })).toBeVisible();
        await page.getByRole("button", { name: "Unfinished puzzles, 2" }).click();
        await expect(page.getByRole("dialog", { name: "Unfinished puzzles" })).toContainText(
          "Replay · 2:13 played"
        );
        await page.getByRole("button", { name: "Close", exact: true }).click();
      } else {
        await expect(page.locator(".ucard")).toContainText(
          `Replay · 3:05 played · ${Math.round((100 * replayEntry("2026-10-24", "medium", 185, 22).filled) / replayEntry("2026-10-24", "medium", 185, 22).empty)}% filled`
        );
        await expect(page.locator(".ucard .ulnk")).toHaveCount(1);
        await expect(page.locator(".ucard .ulnk")).toHaveAttribute(
          "aria-label",
          new RegExp(
            `Medium replay, ${Math.round((100 * replayEntry("2026-10-24", "medium", 185, 22).filled) / replayEntry("2026-10-24", "medium", 185, 22).empty)}% filled\\. Solved in 13:05`
          )
        );
      }
      await showSolvedRow(page);
      await expect(page.locator(".replay-line").filter({ visible: true })).toHaveText(
        "Replay in progress · 2:13 played"
      );
    });
    test(`S4 replaces the old time and removes the replay marker and Unfinished entry at ${width}`, async ({
      page,
    }) => {
      await seedReplay(page);
      await openReplayDay(page);
      const before = await readReplayStorage(page);
      await startReplay(page);
      await page.clock.install({ time: new Date("2026-10-31T22:00:00") });
      await page.clock.fastForward(330_000);
      for (let i = 0; i < 81; i++) {
        if (replayPuzzle[i] !== "0") continue;
        await page.locator(`.cell[data-i="${i}"]`).click();
        await page.keyboard.press(replayAnswer[i]);
        if (i !== replayPuzzle.lastIndexOf("0"))
          expect((await readReplayStorage(page)).solved).toBe(before.solved);
      }
      await expect(page.locator(".sv-view-panel")).toBeVisible();
      await expect(page.locator(".replay-card")).toHaveCount(0);
      await expect(page.locator("#sv-rn")).toHaveText(/finish a replay/);
      const after = await readReplayStorage(page),
        saved = JSON.parse(after.solved)[REPLAY_DATE].easy;
      expect(saved.time).toBeGreaterThanOrEqual(330);
      expect(saved.time).toBeLessThan(350);
      expect(saved.timestamp).toBeGreaterThan(
        JSON.parse(before.solved)[REPLAY_DATE].easy.timestamp
      );
      expect(JSON.parse(after.replay)).toEqual({});
      const time = fmtTime(saved.time);
      await expect(page.locator(".hero")).toHaveText(time);
      await expect(page.locator("#time-control")).toHaveAttribute(
        "aria-label",
        `Solved in ${time} on October 31`
      );
      await expect(page.locator(".summary")).toHaveText(
        `Easy · ${fmtTime(499 - saved.time)} faster than average`
      );
      await page.getByRole("button", { name: "Journal", exact: true }).click();
      await showSolvedRow(page, time);
      await expect(
        page.locator(".sblock .srow").filter({ hasText: "Easy" }).first().locator(".r.num")
      ).toHaveText(["2", fmtTime((499 + saved.time) / 2), time]);
      await expect(page.locator(".day .replay-dot")).toHaveCount(0);
      await expect(page.locator(".ucard .ulnk")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Unfinished puzzles, / })).toHaveCount(0);
    });
  });
}
