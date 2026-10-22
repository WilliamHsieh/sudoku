// Option B: one [Play | Journal] track, same box in both views.
import { test, expect } from "@playwright/test";
import { openBoard } from "./helpers.js";

const EPS = 0.5;

function near(a, b, label) {
  expect(Math.abs(a - b), `${label}: ${a} ≉ ${b}`).toBeLessThanOrEqual(EPS);
}

async function rectOf(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
}

test.describe("desktop view switch", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("Play and Journal share the 64px bar and the same seg box", async ({ page }) => {
    await openBoard(page);
    const header = page.locator(".header");
    const seg = page.getByRole("navigation", { name: "Views" });
    const playSeg = await rectOf(seg);
    const playHeader = await rectOf(header);
    const brand = await page.locator(".header h1").evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        fs: cs.fontSize,
        fw: cs.fontWeight,
        ls: parseFloat(cs.letterSpacing),
      };
    });
    const board = await page.locator(".board").boundingBox();

    near(playHeader.x, 0, "header x");
    near(playHeader.y, 0, "header y");
    near(playHeader.w, 1280, "header w");
    near(playHeader.h, 64, "header h");
    near(brand.x, 32, "brand x");
    expect(brand.fs).toBe("24px");
    expect(brand.fw).toBe("700");
    near(brand.ls, -0.24, "brand tracking");
    near(board.x, 315, "board x");
    near(board.y, 88, "board y");
    near(board.width, 650, "board w");
    near(board.height, 650, "board h");
    near(playSeg.x + playSeg.w, 1248, "seg right");
    expect(playSeg.h).toBeGreaterThan(30);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("button", { name: "Journal", exact: true })).not.toHaveAttribute(
      "aria-current"
    );
    await expect(header).toHaveCSS("border-bottom-width", "1px");
    await expect(header).toHaveCSS("padding-left", "32px");
    await expect(header).toHaveCSS("padding-right", "32px");

    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await expect(page.locator(".journal")).toBeVisible();
    await expect(page.locator(".board")).toHaveCount(0);
    await expect(page.locator(".timer")).toHaveCount(0);

    const journalSeg = await rectOf(page.getByRole("navigation", { name: "Views" }));
    const journalHeader = await rectOf(page.locator(".header"));
    const journalBrand = await rectOf(page.locator(".header h1"));
    near(journalHeader.h, 64, "journal header h");
    near(journalHeader.w, 1280, "journal header w");
    near(journalHeader.y, 0, "journal header y");
    near(journalSeg.x, playSeg.x, "seg x");
    near(journalSeg.y, playSeg.y, "seg y");
    near(journalSeg.w, playSeg.w, "seg w");
    near(journalSeg.h, playSeg.h, "seg h");
    near(journalBrand.x, brand.x, "brand x");
    near(journalBrand.y, brand.y, "brand y");
    await expect(page.getByRole("button", { name: "Journal", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.getByRole("button", { name: "Play", exact: true })).not.toHaveAttribute(
      "aria-current"
    );
  });

  test("pausing does not move the switch, and switching does not resume", async ({ page }) => {
    await openBoard(page);
    await page.locator("#pause").click();
    await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
    const before = await rectOf(page.getByRole("navigation", { name: "Views" }));
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await expect(page.locator(".journal")).toBeVisible();
    const mid = await rectOf(page.getByRole("navigation", { name: "Views" }));
    near(mid.x, before.x, "journal seg x");
    near(mid.y, before.y, "journal seg y");
    near(mid.w, before.w, "journal seg w");
    near(mid.h, before.h, "journal seg h");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("#pause")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".paused-cover")).toBeVisible();
    const after = await rectOf(page.getByRole("navigation", { name: "Views" }));
    near(after.x, before.x, "seg x");
    near(after.y, before.y, "seg y");
    near(after.w, before.w, "seg w");
    near(after.h, before.h, "seg h");
  });

  test("the selected segment does nothing and focus stays on the one that was used", async ({
    page,
  }) => {
    await openBoard(page);
    const time = await page.locator(".timer .time").innerText();
    const play = page.getByRole("button", { name: "Play", exact: true });
    await play.evaluate((el) => /** @type {HTMLElement} */ (el).focus());
    await page.keyboard.press("Enter");
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await expect(page.locator(".timer .time")).toHaveText(time);
    await expect(play).toBeFocused();

    const journal = page.getByRole("button", { name: "Journal", exact: true });
    await journal.evaluate((el) => /** @type {HTMLElement} */ (el).focus());
    await page.keyboard.press("Enter");
    await expect(page.locator(".journal")).toBeVisible();
    await expect(journal).toBeFocused();
    await expect(journal).toHaveAttribute("aria-current", "page");

    const outline = await journal.evaluate((el) => {
      /** @type {HTMLElement} */ (el).focus({ focusVisible: true });
      const cs = getComputedStyle(el);
      return {
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
        offset: cs.outlineOffset,
      };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBe("2px");
    expect(outline.offset).toBe("1px");
    expect(outline.color).toBe("rgb(42, 86, 198)");
  });
});
