import { test, expect } from "@playwright/test";
import { buildHistory, seedHistory } from "./journal-fixtures.js";

const NOW = new Date("2026-10-18T12:00:00");

test.describe("desktop journal", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
  });

  test("selected day is fill plus blue ring; latest ink ring drops when selected", async ({
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
        beforeColor: before.borderTopColor,
        after: after.borderTopWidth,
        outline: getComputedStyle(el).outlineStyle,
      };
    });
    expect(ring.before).toBe("2px");
    expect(ring.beforeColor).toBe("rgb(28, 26, 22)");
    expect(ring.after === "0px" || ring.after === "").toBeTruthy();
    expect(ring.outline === "none" || ring.outline === "").toBeTruthy();

    await page.locator('.dgrid .day[data-d="2026-10-15"]').click();
    const sel = page.locator(".dgrid .day.sel");
    await expect(sel).toHaveCount(1);
    await page.mouse.move(0, 0);
    await expect(sel).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const paint = await sel.evaluate((el) => {
      const after = getComputedStyle(el, "::after");
      return {
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
        inset: after.top,
      };
    });
    expect(paint.afterW).toBe("3px");
    expect(paint.afterColor).toBe("rgb(42, 86, 198)");
    expect(paint.inset).toBe("1px");

    await latest.click();
    await expect(latest).toHaveClass(/sel/);
    await page.mouse.move(0, 0);
    await expect(latest).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const latestSel = await latest.evaluate((el) => {
      const before = getComputedStyle(el, "::before");
      const after = getComputedStyle(el, "::after");
      return {
        beforeColor: before.borderTopColor,
        beforeW: before.borderTopWidth,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
      };
    });
    const dropped =
      latestSel.beforeW === "0px" ||
      latestSel.beforeColor === "rgba(0, 0, 0, 0)" ||
      latestSel.beforeColor === "transparent";
    expect(dropped).toBeTruthy();
    expect(latestSel.afterW).toBe("3px");
    expect(latestSel.afterColor).toBe("rgb(42, 86, 198)");
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

test.describe("mobile journal selected", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("selected day stays fill only: no blue ring", async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedHistory(page, buildHistory("default"));
    await page.goto("./");
    await page.locator(".mobile .day.is-latest").click();
    const sel = page.locator(".mobile .day.sel");
    await expect(sel).toHaveCount(1);
    await expect(sel).toHaveCSS("background-color", "rgb(211, 224, 248)");
    const paint = await sel.evaluate((el) => {
      const cs = getComputedStyle(el);
      const after = getComputedStyle(el, "::after");
      return {
        outline: cs.outlineStyle,
        outlineW: cs.outlineWidth,
        afterW: after.borderTopWidth,
        afterColor: after.borderTopColor,
      };
    });
    expect(paint.outline === "none" || paint.outline === "").toBeTruthy();
    expect(paint.outlineW === "0px" || paint.outlineW === "").toBeTruthy();
    const afterOff =
      paint.afterW === "0px" ||
      paint.afterW === "" ||
      paint.afterColor === "rgba(0, 0, 0, 0)" ||
      paint.afterColor === "transparent";
    expect(afterOff).toBeTruthy();
  });
});
