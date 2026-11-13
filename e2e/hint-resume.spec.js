import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile" : "desktop", () => {
    test.use({
      viewport: mobile ? { width: 402, height: 874 } : { width: 1280, height: 900 },
      deviceScaleFactor: mobile ? 3 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    for (const stage of [0, 1, 2]) {
      test(`Resume preserves hint stage ${stage + 1} across pause, Journal and reload`, async ({
        page,
      }) => {
        await openBoard(page);
        await page.locator("#hint-trigger").click();
        const position = page.locator("#hint-panel .hint-position");
        await expect(position).toHaveText("1/3");
        for (let n = 0; n < stage; n++)
          await page.locator('#hint-panel [data-action="next-stage"]').click();
        const title = await page.locator("#hint-panel .hint-body").innerText();
        await page.locator("#time-control").click();
        await expect(page.locator("#hint-panel")).toHaveAttribute("inert", "");
        await expect(page.locator("#hint-panel")).toHaveAttribute("aria-hidden", "true");
        await page.locator("#resume").click();
        await expect(position).toHaveText(`${stage + 1}/3`);
        await expect(page.locator("#hint-panel .hint-body")).toHaveText(title);
        await page.locator(".dbtn").click();
        await expect(page.locator("#hint-panel")).toHaveCount(0);
        await page.getByRole("button", { name: "Back to game", exact: true }).click();
        await expect(position).toHaveText(`${stage + 1}/3`);
        await page.reload();
        await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
        await expect(position).toHaveText(`${stage + 1}/3`);
        await expect(page.locator("#hint-panel .hint-body")).toHaveText(title);
        await page.getByRole("button", { name: "收起提示", exact: true }).click();
        await page.reload();
        await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
        await expect(page.locator("#hint-panel")).toHaveCount(0);
        await page.locator("#hint-trigger").click();
        await expect(position).toHaveText("1/3");
      });
    }
  });
}

test("custom puzzle reopen keeps each puzzle's own hint and explicit Escape close", async ({
  page,
}) => {
  const second =
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
  await openBoard(page);
  const firstURL = page.url();
  await page.locator("#hint-trigger").click();
  await page.locator('#hint-panel [data-action="next-stage"]').click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  await openBoard(page, `./?q=${second}`);
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await page.locator("#hint-trigger").click();
  await page.locator('#hint-panel [data-action="next-stage"]').click();
  await page.locator('#hint-panel [data-action="next-stage"]').click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("3/3");
  await openBoard(page, firstURL);
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  await page.keyboard.press("Escape");
  await expect(page.locator("#hint-trigger")).toBeFocused();
  await page.locator("#time-control").click();
  await page.locator("#resume").click();
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await openBoard(page, `./?q=${second}`);
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("3/3");
});

test("saved reading does not survive an answer changed before reload", async ({ page }) => {
  await openBoard(page);
  await page.locator("#hint-trigger").click();
  await page.locator('#hint-panel [data-action="next-stage"]').click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("sudoku-custom-progress"));
    const entry = Object.values(store.puzzles)[0];
    entry.snapshot.answers = "4" + entry.snapshot.answers.slice(1);
    localStorage.setItem("sudoku-custom-progress", JSON.stringify(store));
  });
  await page.reload();
  await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
  await expect(page.locator('.board > .cell[data-i="0"]')).toHaveAttribute("data-value", "4");
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await page.locator("#hint-trigger").click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
});
