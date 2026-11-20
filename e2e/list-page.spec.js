// Shared E list page: level number wall + info bar, preview cards, and the Custom source.
import { test, expect } from "@playwright/test";
import { seed, openList, solved } from "./bank-fixture.js";

const cards = (page) => page.locator(".cd .meta b");

for (const width of [390, 1280])
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, reducedMotion: "reduce" });

    test("level tabs count a replay as In progress and list Solved newest first", async ({
      page,
    }) => {
      await seed(page, { count: 2, replay: true, extra: true });
      await openList(page);
      await expect(page.getByRole("heading", { name: "Level 3", exact: true })).toBeVisible();
      await expect(page.locator(".bank-pages .status")).toHaveCount(0);
      await expect(page.getByRole("tab", { name: /^Unsolved \d+$/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Solved 2" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "In progress 2" })).toBeVisible();
      await expect(page.locator(".t.done")).toHaveText(["1", "2"]);
      await expect(page.locator(".t.redo")).toHaveText("3");
      await expect(page.locator(".t.prog")).toHaveText("4");
      await expect(page.locator(".t.next")).toHaveCount(1);
      await page.getByRole("tab", { name: "Solved 2" }).click();
      await expect(cards(page)).toHaveText(["#2", "#1"]);
      await page.getByRole("tab", { name: "In progress 2" }).click();
      await expect(cards(page)).toHaveText(["#3", "#4"]);
      await expect(page.locator(".cd").first()).toContainText("Previous 8:10");
      await page.getByRole("button", { name: /^#3, Replaying/ }).click();
      await expect(page.getByRole("button", { name: "Resume replay" })).toBeVisible();
    });

    test("tapping a wall tile raises the info bar; its button runs the row action", async ({
      page,
    }) => {
      await seed(page, { count: 1, extra: true });
      await openList(page);
      const bar = page.getByRole("region", { name: "#1" });
      await page.getByRole("button", { name: /^#1, Solved/ }).click();
      await expect(bar).toContainText("Solved · 8:10");
      await expect(bar).toContainText("Solved Nov 9");
      await expect(bar.getByRole("button", { name: "View solved board" })).toBeVisible();
      await expect(bar.locator("svg.thumb")).toBeVisible();
      await expect(page.locator(".t.picked")).toHaveText("1");
      await page.getByRole("button", { name: /^#3, In progress/ }).click();
      await expect(bar).toHaveCount(0);
      await expect(page.getByRole("region", { name: "#3" })).toContainText("Last played");
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.locator(".pv")).toHaveCount(0);
      await page.getByRole("button", { name: "#4, Unsolved", exact: true }).click();
      const unsolved = page.getByRole("region", { name: "#4" });
      await expect(unsolved).toContainText("Not started");
      await expect(unsolved.getByRole("button", { name: "Start", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^#3, In progress/ }).click();
      await page.getByRole("button", { name: "Resume", exact: true }).click();
      await expect(page.locator("[data-time]").first()).toContainText("2:03");
    });

    test("a fresh level shows the In progress and Solved empty states", async ({ page }) => {
      await seed(page, { highest: 4 });
      await openList(page, 4);
      await expect(page.getByRole("tab", { name: "Solved 0" })).toBeVisible();
      await page.getByRole("tab", { name: "In progress 0" }).click();
      await expect(page.locator(".empty")).toContainText("No puzzles in progress");
      await expect(page.locator(".empty")).toContainText(
        "Start a puzzle and leave midway, and it shows up here."
      );
      await page.getByRole("tab", { name: "Solved 0" }).click();
      await expect(page.locator(".empty")).toContainText("No solved puzzles yet");
      await expect(page.locator(".empty")).toContainText(
        "Puzzles you solve show up here, ready to replay."
      );
      await expect(page.getByRole("button", { name: "Next: #1" })).toBeVisible();
    });

    test("Custom page: home card, tabs, recent-first cards and tap rules", async ({ page }) => {
      await seed(page, {
        extra: true,
        customBoards: [
          { state: "solved", solved: 442 },
          { state: "in_progress", time: 125 },
          { state: "replaying" },
          { state: "solved", label: "NYT 2026-11-10 · Hard" },
        ],
      });
      const card = page.getByRole("button", { name: "Custom puzzle", exact: true });
      await expect(card).toContainText("4 puzzles · Enter or paste a new one");
      await card.click();
      await expect(page.getByRole("heading", { name: "Custom puzzles" })).toBeVisible();
      await expect(page.getByRole("tab")).toHaveText(["All 4", "Solved 2", "In progress 2"]);
      await expect(cards(page)).toHaveText([
        "NYT 2026-11-10 · Hard",
        "Custom #3",
        "Custom #2",
        "Custom #1",
      ]);
      await expect(page.getByRole("button", { name: "Custom #1, Solved · 7:22" })).toBeVisible();
      await expect(page.locator(".cd").first()).toContainText("NYT Hard");
      await page.getByRole("button", { name: "NYT 2026-11-10 · Hard, Solved · 7:22" }).click();
      await expect(page.locator(".header .t1")).toHaveText("NYT 2026-11-10 · Hard");
      await expect(page.locator(".sv-view-panel .summary")).toHaveText("NYT 2026-11-10 · Hard");
      await page.getByRole("button", { name: "Custom puzzles" }).click();
      await page.getByRole("tab", { name: "In progress 2" }).click();
      await expect(cards(page)).toHaveText(["Custom #3", "Custom #2"]);
      await page.getByRole("button", { name: /^Custom #2, In progress/ }).click();
      await expect(page.locator(".header .t1")).toHaveText("Custom #2");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("button", { name: "Custom #1, Solved · 7:22" }).click();
      await expect(page.locator(".sv-view-panel .summary")).toHaveText("Custom #1");
      await page.getByRole("button", { name: "Custom puzzles" }).click();
      await page.getByRole("button", { name: "New custom puzzle" }).click();
      await expect(page.locator(".input-cell")).toHaveCount(81);
    });

    test("a first Custom solve returns to the list with the solved card", async ({ page }) => {
      await solved(page, { custom: true });
      await page.getByRole("button", { name: "Custom puzzles" }).click();
      await page.getByRole("tab", { name: "Solved 1" }).click();
      await expect(page.getByRole("button", { name: /^Custom #1, Solved · / })).toBeVisible();
    });
  });
