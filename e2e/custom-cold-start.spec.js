import { test, expect } from "@playwright/test";
import { fixture } from "./bank-fixture.js";
import { BANK_LOCK } from "../src/bank/write-lock.js";
import { CUSTOM_SAVES_KEY } from "../src/bank/custom-recorder.js";

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

for (const [complete, toast] of [
  [false, "這題之前玩過，已幫你接著玩"],
  [true, "這題之前解過"],
])
  test(`Start before the saves load reopens a known ${complete ? "solved" : "unfinished"} link`, async ({
    page,
  }) => {
    const data = await fixture({ custom: true, complete, time: 125 });
    await page.addInitScript(
      ([storage, lock]) => {
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
        localStorage.setItem("sudoku-keypad-coach", "1");
        void navigator.locks.request(
          lock,
          () => new Promise((release) => (window["releaseSaves"] = release))
        );
      },
      [data.storage, BANK_LOCK]
    );
    await page.goto(`./?q=${data.puzzle.digits}`);
    await page.getByRole("button", { name: "Start puzzle", exact: true }).click();
    await page.evaluate(() => window["releaseSaves"]());
    await expect(page.locator(".toast")).toHaveText(toast);
    await expect(page.locator(".header .t1")).toHaveText("Custom 1");
    await expect(page.locator(".sv-view-panel")).toHaveCount(complete ? 1 : 0);
    expect(
      await page.evaluate(
        (key) => Object.keys(JSON.parse(localStorage.getItem(key)).slots),
        CUSTOM_SAVES_KEY
      )
    ).toEqual(["target"]);
  });
