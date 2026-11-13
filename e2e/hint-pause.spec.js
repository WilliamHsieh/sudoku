import { test, expect } from "@playwright/test";
import { openPhaseThreeCase, phaseThreeCases } from "./phase-three-cases.js";
import { openBoard, DEMO_PUZZLE } from "./helpers.js";

const longHint = phaseThreeCases.find((c) => c.id === "aligned-pair-exclusion" && c.width === 390);
async function openReading(page) {
  await openPhaseThreeCase(page, longHint);
  await page.setViewportSize({ width: 402, height: 874 });
  await page.locator("#hint-trigger").click();
  await page.locator('#hint-panel [data-action="next-stage"]').click();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  const body = page.locator("#hint-panel .hint-body");
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(20);
  await body.evaluate((el) => {
    el.scrollTop = 80;
  });
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
  // Retain node references and observe every painted frame through the transitions.
  await page.evaluate(() => {
    const panel = document.querySelector("#hint-panel");
    const body = panel.querySelector(".hint-body");
    window.__reading = {
      panel,
      body,
      scroll: body.scrollTop,
      rect: panel.getBoundingClientRect().toJSON(),
      failures: [],
      active: true,
    };
    const watch = () => {
      const saved = window.__reading;
      if (!saved.active) return;
      const chrome = document.querySelector(".mobile-chrome");
      if (!panel.isConnected || document.querySelector("#hint-panel") !== panel)
        saved.failures.push("panel replaced");
      if (getComputedStyle(chrome).visibility !== "hidden" || !chrome.inert)
        saved.failures.push("keypad exposed");
      if (body.scrollTop !== saved.scroll) saved.failures.push("scroll changed");
      if (JSON.stringify(panel.getBoundingClientRect().toJSON()) !== JSON.stringify(saved.rect))
        saved.failures.push("layout changed");
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}
async function sameReading(page) {
  const state = await page.evaluate(() => {
    const saved = window.__reading;
    const panel = document.querySelector("#hint-panel");
    return {
      same: saved.panel === panel,
      scroll: saved.body.scrollTop,
      expectedScroll: saved.scroll,
      rect: panel?.getBoundingClientRect().toJSON(),
      expectedRect: saved.rect,
      failures: saved.failures,
    };
  });
  expect(state.same).toBe(true);
  expect(state.scroll).toBe(state.expectedScroll);
  expect(state.rect).toEqual(state.expectedRect);
  expect(state.failures).toEqual([]);
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
}
async function masked(page) {
  const panel = page.locator("#hint-panel");
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute("inert", "");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("complementary", { name: "提示" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "提示說明" })).toHaveCount(0);
  const style = await panel.locator(".hint-body").evaluate((el) => {
    const css = getComputedStyle(el);
    return { filter: css.filter, opacity: Number(css.opacity) };
  });
  expect(style.filter).toBe("blur(8px)");
  expect(style.opacity).toBeLessThanOrEqual(0.3);
  for (const selector of ["#resume", "#time-control"]) {
    expect(
      await page.locator(selector).evaluate((el) => {
        for (let node = el; node; node = node.parentElement)
          if (getComputedStyle(node).filter !== "none" || node.inert) return false;
        return true;
      })
    ).toBe(true);
  }
}

test.use({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});
for (const reducedMotion of ["no-preference", "reduce"]) {
  test(`pause masks the mounted scrolled hint and repeated Resume keeps it (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await openReading(page);
    for (let n = 0; n < 2; n++) {
      await page.locator("#time-control").tap();
      await masked(page);
      await sameReading(page);
      const time = await page.locator("#header-time").textContent();
      await page.waitForTimeout(1100);
      await expect(page.locator("#header-time")).toHaveText(time);
      // Inert must block native hit testing, focus, keyboard close and story navigation.
      const button = page.locator('#hint-panel [data-action="next-stage"]');
      const rect = await button.boundingBox();
      await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await button.evaluate((el) => el.focus());
      await expect(button).not.toBeFocused();
      expect(
        await page
          .locator("#hint-panel button, #hint-panel [tabindex], .mobile-chrome button")
          .evaluateAll((controls) =>
            controls.every((el) => {
              el.focus();
              return document.activeElement !== el;
            })
          )
      ).toBe(true);
      await page.keyboard.press("Escape");
      for (let tab = 0; tab < 5; tab++) {
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(() => !!document.activeElement.closest("#hint-panel, .mobile-chrome"))
        ).toBe(false);
      }
      await sameReading(page);
      await page.locator("#resume").tap();
      await expect(page.locator("#hint-panel")).not.toHaveAttribute("inert");
      await expect(page.locator("#hint-panel .hint-body")).toHaveCSS("filter", "none");
      await page.waitForTimeout(400);
      await sameReading(page);
    }
  });
}

for (const signal of ["blur", "pagehide", "freeze", "visibilitychange"]) {
  test(`${signal} masks the hint synchronously and auto return retains reading`, async ({
    page,
  }) => {
    await openReading(page);
    const immediate = await page.evaluate((signal) => {
      if (signal === "visibilitychange")
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      const target = ["freeze", "visibilitychange"].includes(signal) ? document : window;
      target.dispatchEvent(new Event(signal));
      const panel = document.querySelector("#hint-panel");
      return {
        same: panel === window.__reading.panel,
        inert: panel?.inert,
        hidden: panel?.getAttribute("aria-hidden"),
        filter: panel && getComputedStyle(panel.querySelector(".hint-body")).filter,
      };
    }, signal);
    expect(immediate).toEqual({ same: true, inert: true, hidden: "true", filter: "blur(8px)" });
    await page.waitForTimeout(1100);
    await masked(page);
    await sameReading(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      window.dispatchEvent(new Event("focus"));
    });
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "hold");
    await masked(page);
    await expect(page.locator(".play")).toHaveAttribute("data-resume-phase", "idle");
    await expect(page.locator("#hint-panel")).not.toHaveAttribute("inert");
    await sameReading(page);
  });
}

test("manual pause remains masked after background return, and navigation/reload restore safely", async ({
  page,
}) => {
  await openReading(page);
  await page.locator("#time-control").tap();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await masked(page);
  await sameReading(page);
  await page.evaluate(() => {
    window.__reading.active = false;
  });
  await page.locator(".dbtn").tap();
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to game", exact: true }).tap();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  await expect(page.locator("#hint-panel")).not.toHaveAttribute("inert");
  await page.locator("#time-control").tap();
  await page.reload();
  await page.getByRole("button", { name: "Start puzzle", exact: true }).tap();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("2/3");
  await expect(page.locator("#hint-panel")).not.toHaveAttribute("inert");
  await page.getByRole("button", { name: "收起提示", exact: true }).tap();
  await page.locator("#time-control").tap();
  await page.locator("#resume").tap();
  await expect(page.locator("#hint-panel")).toHaveCount(0);
});

test("pausing ordinary play does not open a hint", async ({ page }) => {
  await openBoard(page);
  await page.locator("#time-control").tap();
  await expect(page.locator("#hint-panel")).toHaveCount(0);
  await page.locator("#resume").tap();
  await expect(page.locator("#hint-panel")).toHaveCount(0);
});

test("a first-visit keypad coach stays hidden and inert through pause", async ({ page }) => {
  await page.goto(`./?q=${DEMO_PUZZLE}`);
  await page.getByRole("button", { name: "Start puzzle", exact: true }).tap();
  await expect(page.locator("#coach-ok")).toBeVisible();
  await page.locator("#hint-trigger").tap();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  await page.locator("#time-control").tap();
  await masked(page);
  await expect(page.locator("#coach-ok")).toHaveCount(1);
  await expect(page.locator("#coach-ok")).toBeHidden();
  await page.locator("#coach-ok").evaluate((el) => el.focus());
  await expect(page.locator("#coach-ok")).not.toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator("#resume").tap();
  await expect(page.locator("#hint-panel .hint-position")).toHaveText("1/3");
  await expect(page.locator("#coach-ok")).toBeHidden();
});
