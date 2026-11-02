import { prepareResume } from "./solved-resume-fixture.js";
import { test, expect } from "@playwright/test";
import { prepareDecision, finishDecision, PAST } from "./solved-decisions-fixture.js";
test.use({ colorScheme: "light", viewport: { width: 1280, height: 800 } });
async function token(el, property, name) {
  const colors = await el.evaluate(
    (el, { property, name }) => {
      const p = document.createElement("span");
      p.style.color = `var(${name})`;
      document.body.append(p);
      const expected = getComputedStyle(p).color;
      p.remove();
      return [getComputedStyle(el)[property], expected];
    },
    { property, name }
  );
  expect(colors[0]).toBe(colors[1]);
}
for (const width of [390, 1280]) {
  test(`approved dark tokens, System appearance, and Journal Marks at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    const p = await prepareDecision(page);
    await finishDecision(page, p);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await token(page.locator(".separator"), "color", "--line-box");
    await token(page.locator(".flame"), "color", "--amber");
    await token(page.locator(".sv-next"), "color", "--on-accent");
    await token(page.locator(".sv-panel .mk rect").first(), "fill", "--ink");
    await token(page.locator(".sv-panel .mk rect").last(), "stroke", "--line-box");
    const values = await page.locator("html").evaluate(() =>
      ["--sv-ring-a", "--sv-ring-b", "--sv-kbd-line", "--sv-kbd-bg"].map((k) => {
        const probe = document.createElement("span");
        probe.style.background = `var(${k})`;
        document.body.append(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c.match(/[\d.]+/g).map(Number);
      })
    );
    for (const [i, expected] of [
      [74, 222, 128, 0.12],
      [74, 222, 128, 0.22],
      [25, 40, 58, 0.5],
      [25, 40, 58, 0.1],
    ].entries()) {
      expect(values[i].slice(0, 3)).toEqual(expected.slice(0, 3));
      expect(values[i][3]).toBeCloseTo(expected[3], 2);
    }
    await token(page.locator(".sv-panel .dg rect").last(), "fill", "--sv-bar-off");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await token(page.locator(".sv-panel .mk rect").last(), "stroke", "--line-box");
    await page.evaluate(() => {
      localStorage.setItem("sudoku-theme", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "sudoku-theme", newValue: "dark" }));
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
  for (const reduced of [false, true])
    test(`Journal opens solved date, scrolls it into view, ${reduced ? "static outline" : "1200ms fade"} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const p = await prepareDecision(page, { state: "today-button" });
      await finishDecision(page, p);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      await page.locator(".sv-journal").click();
      const day = page.locator(`.day[data-d="${PAST}"]:visible`);
      await expect(day).toHaveClass(/solve-highlight/);
      await expect(day).toBeInViewport({ ratio: 1 });
      await expect(day).toHaveClass(/sel/);
      await expect(page.locator(".sheet")).toHaveCount(0);
      if (reduced) {
        await expect(day).toHaveCSS("animation-name", "none");
        await expect(day).toHaveCSS("outline-width", "2px");
        await token(day, "outlineColor", "--cue-ink");
        await page.clock.runFor(3000);
        await expect(day).toHaveClass(/solve-highlight/);
      } else {
        await expect(day).toHaveCSS("animation-duration", "1.2s");
        await expect(day).toHaveCSS(
          "animation-timing-function",
          "cubic-bezier(0.22, 0.8, 0.24, 1)"
        );
        await page.clock.runFor(1199);
        await expect(day).toHaveClass(/solve-highlight/);
        await page.clock.runFor(1);
        await expect(day).not.toHaveClass(/solve-highlight/);
      }
    });
}
test("missing average and zero streak are dropped, leaving one equal-width fact", async ({
  page,
}) => {
  const p = await prepareDecision(page, { state: "dropped-facts" });
  await finishDecision(page, p);
  await expect(page.locator(".sv-panel dt")).toHaveCount(1);
  await expect(page.locator(".sv-panel dt")).toHaveText("May 10");
  await expect(page.locator(".sv-panel")).not.toContainText("—");
  await expect(page.locator(".sv-best")).toHaveCount(0);
});
test("slower than average uses +m:ss in plain ink", async ({ page }) => {
  const p = await prepareDecision(page, { state: "slower" });
  await finishDecision(page, p);
  await expect(page.locator(".sv-panel dd").first()).toHaveText("+3:22");
  await token(page.locator(".sv-panel dd").first(), "color", "--ui-ink");
  await expect(page.locator(".sv-best")).toHaveCount(0);
});
for (const state of ["new-best", "normal", "first-ever"])
  test(`New best label decision: ${state}`, async ({ page }) => {
    const p = await prepareDecision(page, { state });
    await finishDecision(page, p);
    await expect(page.locator(".sv-best")).toHaveCount(state === "new-best" ? 1 : 0);
    if (state === "new-best") {
      await expect(page.locator(".sv-best")).toHaveText("New best");
      const best = await page.locator(".sv-best").boundingBox(),
        time = await page.locator(".sv-time").boundingBox();
      expect(best.y + best.height).toBeLessThan(time.y);
      await expect(page.locator(".sv-best")).toHaveCSS("font-size", "14px");
      await expect(page.locator(".sv-live")).toContainText("New best.");
    }
  });
for (const custom of [false, true])
  for (const allToday of [false, true])
    test(`${custom ? "custom" : "past daily"} primary targets ${allToday ? "Journal" : "Today: Medium"}`, async ({
      page,
    }) => {
      const p = await prepareDecision(page, { state: "today-button", custom, allToday });
      await finishDecision(page, p);
      await expect(page.locator(".sv-next")).toContainText(allToday ? "Journal" : "Today: Medium");
      if (allToday) await expect(page.locator(".sv-journal")).toHaveCount(0);
      await page.locator(".sv-next").click();
      if (allToday) await expect(page.locator(".journal")).toBeVisible();
      else {
        await expect(page.locator(".t2")).toContainText("Medium");
        await expect(page.locator(".dbtn")).toHaveAttribute("aria-label", /November 1.*Medium/);
        await expect(page.locator("dialog[open]")).toHaveCount(0);
      }
    });

for (const width of [390, 1280]) {
  for (const state of ["normal", "new-best", "today-button", "first-ever"])
    test(`score content clears dividers at ${width}: ${state}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const p = await prepareDecision(page, { state });
      await finishDecision(page, p);
      await page
        .locator(".sv-panel")
        .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const layout = await page.locator(".sv-panel dl").evaluate((row) => {
        const facts = [...row.children];
        const dividers = facts.slice(1).map((fact) => {
          const style = getComputedStyle(fact, "::before");
          const left =
            fact.getBoundingClientRect().left +
            parseFloat(getComputedStyle(fact).borderLeftWidth) +
            parseFloat(style.left);
          return { left, right: left + parseFloat(style.width) };
        });
        const clearance = facts.flatMap((fact, i) =>
          [...fact.querySelectorAll("dt, dd")].map((content) => {
            const box = content.getBoundingClientRect();
            return {
              label: content.textContent,
              left: i ? box.left - dividers[i - 1].right : null,
              right: i < dividers.length ? dividers[i].left - box.right : null,
            };
          })
        );
        return {
          contentRight: Math.max(
            ...facts.flatMap((fact) =>
              [...fact.querySelectorAll("dt, dd")].map((el) => el.getBoundingClientRect().right)
            )
          ),
          clearance,
          right: row.getBoundingClientRect().right,
          group: row.parentElement.getBoundingClientRect().right,
          panel: row.closest(".sv-panel").getBoundingClientRect().width,
          labelSize: getComputedStyle(facts[0].querySelector("dt")).fontSize,
          facts: facts.length,
        };
      });
      for (const box of layout.clearance) {
        if (box.left != null) expect(box.left, `${box.label}: left`).toBeGreaterThanOrEqual(4);
        if (box.right != null) expect(box.right, `${box.label}: right`).toBeGreaterThanOrEqual(4);
      }
      expect(layout.right).toBeLessThanOrEqual(layout.group);
      expect(layout.contentRight).toBeLessThanOrEqual(layout.group);
      expect(layout.facts).toBe(state === "first-ever" ? 2 : 3);
      if (width === 1280) {
        expect(layout.panel).toBe(236);
        expect(layout.labelSize).toBe("14px");
      }
    });
}
for (const focus of ["heading", "body"])
  test(`Journal primary Enter opens solved day from ${focus}`, async ({ page }) => {
    const p = await prepareDecision(page, { state: "journal-primary" });
    await finishDecision(page, p);
    await expect(page.locator(".sv-next")).toContainText("Journal");
    await expect(page.locator(".sv-next kbd")).toBeVisible();
    await expect(page.locator(".sv-panel dd").last()).toContainText("3/3");
    if (focus === "body") await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await expect(page.locator(".journal")).toBeVisible();
    const day = page.locator(`.day[data-d="${p.date}"]:visible`);
    await expect(day).toHaveClass(/sel/);
    await expect(day).toBeInViewport({ ratio: 1 });
    await expect(day).toHaveClass(/solve-highlight/);
  });

for (const width of [390, 1280]) {
  for (const solved of [false, true])
    test(`More ${solved ? "hides Restart after solve" : "retains Restart while unsolved"} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const p = await prepareDecision(page);
      if (solved) await finishDecision(page, p);
      const saved = await page.evaluate(() => localStorage.getItem("sudoku-solved"));
      await page.locator("[data-more]").filter({ visible: true }).click();
      await expect(page.getByRole("dialog", { name: "Options", exact: true })).toBeVisible();
      if (solved) {
        await expect(page.locator("#opt-restart")).toHaveCount(0);
        await expect(page.getByRole("combobox", { name: /Appearance/ })).toBeVisible();
        await page.getByRole("button", { name: "Done", exact: true }).click();
        await expect(page.locator(".sv-panel")).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("sudoku-solved"))).toBe(saved);
      } else {
        await expect(
          page.getByRole("button", { name: "Restart puzzle", exact: true })
        ).toBeVisible();
        await page.getByRole("button", { name: "Restart puzzle", exact: true }).click();
        await expect(page.getByRole("alertdialog", { name: "Restart this puzzle?" })).toBeVisible();
      }
    });
  for (const previousYear of [false, true])
    test(`Resume fit ${previousYear ? "previous-year" : "Dec 28"} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      const label = await prepareResume(page, previousYear);
      const button = page.locator(".sv-next");
      await expect(button).toHaveAccessibleName(label);
      await expect(button.locator(".resume-prefix")).toHaveText("Resume");
      expect(await button.locator(".resume-prefix").textContent()).toBe("Resume ");
      await expect(button.locator(".resume-detail")).toHaveText(label.slice(7));
      const fit = await button.evaluate((el) => {
        const prefix = el.querySelector(".resume-prefix"),
          detail = el.querySelector(".resume-detail"),
          label = el.querySelector(".resume-label"),
          icon = el.querySelector("svg");
        const box = el.getBoundingClientRect();
        return {
          button: el.clientWidth,
          scroll: el.scrollWidth,
          prefix: prefix.getBoundingClientRect().width,
          prefixScroll: prefix.scrollWidth,
          prefixClient: prefix.clientWidth,
          icon: icon.getBoundingClientRect().width,
          left: icon.getBoundingClientRect().left - box.left,
          right: box.right - detail.getBoundingClientRect().right,
          clipped: detail.scrollWidth > detail.clientWidth,
          font: getComputedStyle(label).fontSize,
          ellipsis: getComputedStyle(detail).textOverflow,
          prefixOverflow: getComputedStyle(prefix).textOverflow,
        };
      });
      expect(fit.scroll).toBeLessThanOrEqual(fit.button);
      expect(fit.prefix).toBeGreaterThan(35);
      expect(fit.prefixScroll).toBeLessThanOrEqual(fit.prefixClient);
      expect(fit.icon).toBe(width === 390 ? 17 : 18);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeGreaterThanOrEqual(0);
      expect(fit.ellipsis).toBe("ellipsis");
      expect(fit.prefixOverflow).not.toBe("ellipsis");
      if (fit.clipped) expect(fit.font).toBe("14px");
      await button.click();
      await expect(page.locator(".dbtn")).toHaveAttribute("aria-label", /December 28, Medium/);
    });
}
test("reduced-motion Journal outline and tint share rounded corners", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const p = await prepareDecision(page, { state: "today-button" });
  await finishDecision(page, p);
  await page.locator(".sv-journal").click();
  const day = page.locator(`.day[data-d="${PAST}"]:visible`);
  await expect(day).toHaveClass(/solve-highlight/);
  await expect(day).toHaveCSS("outline-width", "2px");
  await expect(day).toHaveCSS("border-radius", "10px");
  expect(await day.evaluate((el) => getComputedStyle(el, "::after").borderRadius)).toBe("10px");
});

for (const width of [390, 1280])
  test(`solved custom puzzle keeps its undated panel and More editor entry at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    const p = await prepareDecision(page, { custom: true });
    await finishDecision(page, p);
    await expect(page.locator(".sv-panel dl")).toHaveCount(0);
    await expect(page.locator(".sv-best")).toHaveCount(0);
    await expect(page.locator(".sv-next")).toContainText("Today: Medium");
    await page.locator("[data-more]").filter({ visible: true }).click();
    await expect(page.locator("#opt-restart")).toHaveCount(0);
    await expect(page.locator("#opt-custom")).toBeVisible();
    await page.locator("#opt-custom").click();
    await expect(page.locator(".input-cell")).toHaveCount(81);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to daily puzzles" }).click();
    await expect(page.locator(".journal")).toBeVisible();
  });
