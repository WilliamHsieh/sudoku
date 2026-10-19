import { test, expect } from "@playwright/test";
import { buildHistory, seedHistory } from "./journal-fixtures.js";

const NOW = new Date("2026-10-18T12:00:00");

test.describe("desktop journal", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
    await page.clock.pauseAt(NOW);
  });

  test("selected day is fill only: no blue ring, latest ring drops when selected", async ({
    page,
  }) => {
    const latest = page.locator('.dgrid .day[data-d="2026-10-18"]');
    await expect(latest).toHaveClass(/is-latest/);
    await expect(latest).not.toHaveClass(/sel/);
    const ring = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      const after = getComputedStyle(el, "::after");
      return {
        before: before.borderTopWidth,
        after: after.borderTopWidth,
        outline: getComputedStyle(el).outlineStyle,
      };
    });
    expect(ring.before).toBe("2px");
    expect(ring.after === "0px" || ring.after === "").toBeTruthy();
    expect(ring.outline === "none" || ring.outline === "").toBeTruthy();

    await page.locator('.dgrid .day[data-d="2026-10-15"]').click();
    const sel = page.locator(".dgrid .day.sel");
    await expect(sel).toHaveCount(1);
    const paint = await sel.evaluate((el) => {
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, "::after");
      return {
        bg: cs.backgroundColor,
        outline: cs.outlineStyle,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
      };
    });
    expect(paint.bg).toBe("rgb(211, 224, 248)");
    expect(paint.outline === "none" || paint.outline === "").toBeTruthy();
    expect(paint.afterW === "0px" || paint.afterW === "").toBeTruthy();

    await latest.click();
    await expect(latest).toHaveClass(/sel/);
    const latestSel = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      return {
        bg: getComputedStyle(el).backgroundColor,
        beforeColor: before.borderTopColor,
        beforeW: before.borderTopWidth,
      };
    });
    expect(latestSel.bg).toBe("rgb(211, 224, 248)");
    const dropped =
      latestSel.beforeW === "0px" ||
      latestSel.beforeColor === "rgba(0, 0, 0, 0)" ||
      latestSel.beforeColor === "transparent";
    expect(dropped).toBeTruthy();
  });

  test("unfinished card lists other days only, with no Resume", async ({ page }) => {
    await expect(page.locator(".ucard")).toBeVisible();
    await expect(page.locator(".ucard .ucount")).toHaveText("1");
    await expect(page.locator(".ulnk")).toHaveCount(1);
    await expect(page.locator(".ucard")).not.toContainText("Resume");
    await expect(page.locator(".ctx .btn-primary")).toHaveCount(1);

    await page.locator(".ulnk").click();
    await expect(page.locator(".dgrid .day.sel")).toHaveAttribute("data-d", "2026-10-15");
    await expect(page.locator(".ctx h2")).toContainText("October 15");
    await expect(page.locator(".ucard .ucount")).toHaveText("1");
    await expect(page.locator(".ulnk")).toContainText("Medium");
    await expect(page.locator(".ulnk")).toContainText("Oct 18");
  });
});

test.describe("desktop unfinished empty", () => {
  test("shows a quiet empty line and no pill", async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("nounf"));
    await page.goto("./");
    await expect(page.locator(".ucard .uempty")).toHaveText("No unfinished puzzles right now.");
    await expect(page.locator(".ucard .ucount")).toHaveCount(0);
    await expect(page.locator(".ulink")).toHaveCount(0);
  });
});
