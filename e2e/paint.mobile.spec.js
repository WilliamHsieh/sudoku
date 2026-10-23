import { test, expect } from "@playwright/test";
import { paintCases, paintSetup } from "./paint-cases.js";
import { cell, pencil } from "./helpers.js";
paintCases(true);

for (const keyFirst of [true, false]) {
  test(`HOLD paints with a fixed brush and commits on key release (${keyFirst ? "key" : "board"} first)`, async ({
    page,
  }) => {
    const t = await paintSetup(page, true);
    const key = page.locator('.key[data-d="5"]');
    const k = { ...(await t.center(key)), id: 1 };
    const a = { ...(await t.center(cell(page, 37))), id: 2 };
    const b = { ...(await t.center(cell(page, 42))), id: 2 };
    await t.contacts("touchStart", [k]);
    await page.waitForTimeout(300);
    await t.contacts("touchStart", [k, a]);
    await t.contacts("touchMove", [k, b]);
    for (const i of [37, 38, 41, 42]) await expect(pencil(page, i, 5)).toHaveClass(/paint-blue/);
    await expect(page.locator("#undo")).toBeDisabled();
    // Key drift must not become a lock or a swipe-up edit after paint begins.
    const drift = { ...k, y: k.y + 45 };
    await t.contacts("touchMove", [drift, b]);
    await expect(key).not.toHaveClass(/arm-lock/);
    if (keyFirst) {
      await t.contacts("touchEnd", [drift]);
      await expect(page.locator("#undo")).toBeEnabled();
      const c = { ...(await t.center(cell(page, 43))), id: 2 };
      await t.contacts("touchMove", [c]);
      await expect(cell(page, 43)).toHaveAttribute("data-notes", "");
      await t.contacts("touchEnd", []);
    } else {
      await t.contacts("touchEnd", [b]);
      await expect(page.locator("#undo")).toBeDisabled();
      // A new board contact belongs to the same stroke and keeps its brush.
      await t.contacts("touchStart", [drift, a]);
      await expect(cell(page, 37)).toHaveAttribute("data-notes", "5");
      await t.contacts("touchEnd", [a]);
      await t.contacts("touchEnd", []);
    }
    await expect(page.locator("#keypad")).toHaveAttribute("data-locked", "0");
    await expect(page.locator(".play .sr-only[aria-live]")).toHaveText(
      "Added 5 to 4 cells; 1 cell refused"
    );
    await page.locator("#undo").click();
    for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
    await expect(page.locator("#undo")).toBeDisabled();
  });
}

test("LOCK ignores an extra board finger; cancellation restores every painted cell", async ({
  page,
}) => {
  const t = await paintSetup(page, true);
  await t.lock();
  const a = { ...(await t.center(cell(page, 37))), id: 1 };
  const b = { ...(await t.center(cell(page, 43))), id: 2 };
  await t.contacts("touchStart", [a]);
  await t.contacts("touchStart", [a, b]);
  await expect(cell(page, 43)).toHaveAttribute("data-notes", "");
  await t.cancel();
  await expect(cell(page, 37)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeDisabled();
});

test("HOLD cancellation restores its draft and an illegal first cell flashes without toast", async ({
  page,
}) => {
  const t = await paintSetup(page, true);
  const k = { ...(await t.center(page.locator('.key[data-d="5"]'))), id: 1 };
  const a = { ...(await t.center(cell(page, 37))), id: 2 };
  const b = { ...(await t.center(cell(page, 42))), id: 2 };
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  await t.contacts("touchStart", [k, a]);
  await t.contacts("touchMove", [k, b]);
  await expect(cell(page, 38)).toHaveAttribute("data-notes", "5");
  await t.cancel();
  for (const i of [37, 38, 41, 42]) await expect(cell(page, i)).toHaveAttribute("data-notes", "");
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator(".play .sr-only[aria-live]")).toHaveText("");
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  const refused = { ...(await t.center(cell(page, 40))), id: 2 };
  await t.contacts("touchStart", [k, refused]);
  await expect(cell(page, 4)).toHaveClass(/blocked/);
  await expect(page.locator(".toast")).toHaveCount(0);
  await t.contacts("touchMove", [k, b]);
  await expect(cell(page, 42)).toHaveAttribute("data-notes", "5");
  await t.contacts("touchEnd", []);
  await expect(page.locator("#undo")).toBeEnabled();
});

test("HOLD blue chip shows even when another digit remains locked", async ({ page }) => {
  const t = await paintSetup(page, true);
  await t.lock(6);
  const k = { ...(await t.center(page.locator('.key[data-d="5"]'))), id: 1 };
  const a = { ...(await t.center(cell(page, 37))), id: 2 };
  await t.contacts("touchStart", [k]);
  await page.waitForTimeout(300);
  await t.contacts("touchStart", [k, a]);
  await expect(pencil(page, 37, 5)).toHaveClass(/paint-blue/);
  await expect(pencil(page, 37, 5)).not.toHaveClass(/matching-number/);
  await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgb(223, 232, 250)");
  await t.contacts("touchEnd", []);
  await expect(pencil(page, 37, 5)).not.toHaveClass(/paint-added/);
  await expect(pencil(page, 37, 5)).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

for (const brush of ["add", "remove"]) {
  test(`HOLD lift and re-touch keeps the ${brush} brush and never ghosts a net-zero cell`, async ({
    page,
  }) => {
    const t = await paintSetup(page, true);
    const present = brush === "add" ? "5" : "";
    const original = brush === "add" ? "" : "5";
    await t.lock();
    // Cell 37 fixes the brush; cell 38 already has that brush state.
    await t.tap(cell(page, brush === "add" ? 38 : 37));
    await t.tap(page.locator('.key[data-d="5"]'));
    // Also exercise Space while HOLD overrides a different locked digit.
    await t.lock(6);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const k = { ...(await t.center(page.locator('.key[data-d="5"]'))), id: 1 };
    const a = { ...(await t.center(cell(page, 37))), id: 2 };
    const b = { ...(await t.center(cell(page, 38))), id: 2 };
    const extra = { ...(await t.center(cell(page, 42))), id: 3 };
    await t.contacts("touchStart", [k]);
    await page.clock.runFor(251);
    const samples = await cell(page, 38).evaluateHandle((el) => {
      const frames = [];
      const ghosts = [];
      const ghost = () => el.querySelectorAll(".ghost").length;
      let raf;
      const sample = () => {
        frames.push({ notes: el.getAttribute("data-notes"), ghosts: ghost() });
        raf = requestAnimationFrame(sample);
      };
      const observer = new MutationObserver((records) => {
        // Include old values so a ghost added and removed in one task is seen.
        ghosts.push(ghost(), ...records.map((r) => (/\bghost\b/.test(r.oldValue || "") ? 1 : 0)));
      });
      observer.observe(el, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class"],
      });
      sample();
      return {
        frames,
        ghosts,
        stop() {
          cancelAnimationFrame(raf);
          observer.disconnect();
        },
      };
    });
    for (const contact of [a, b, a, b]) {
      await t.contacts("touchStart", [k, contact]);
      await page.clock.runFor(32);
      // A concurrent board finger must not start a second stroke.
      await t.contacts("touchStart", [k, contact, extra]);
      await t.contacts("touchEnd", [extra]);
      await expect(cell(page, 42)).toHaveAttribute("data-notes", "");
      await page.keyboard.press("Space");
      await expect(cell(page, 37)).toHaveAttribute("data-notes", present);
      await expect(cell(page, 38)).toHaveAttribute("data-notes", present);
      await expect(pencil(page, 38, 5)).not.toHaveClass(/paint-added|ghost/);
      await t.contacts("touchEnd", [contact]); // Key stays down between visits.
      await page.clock.runFor(32);
    }
    await expect(pencil(page, 37, 5)).toHaveClass(brush === "add" ? /paint-added/ : /ghost/);
    await t.contacts("touchEnd", [k]);
    await expect(cell(page, 37)).toHaveAttribute("data-notes", present);
    await page.clock.runFor(701); // Sample the full committed marker lifetime.
    const captured = await samples.evaluate((s) => {
      s.stop();
      return { frames: s.frames, ghosts: s.ghosts };
    });
    expect(captured.frames.length).toBeGreaterThan(10);
    expect(captured.frames.every((s) => s.notes === present && s.ghosts === 0)).toBe(true);
    expect(captured.ghosts.every((n) => n === 0)).toBe(true);
    await expect(page.locator(".cell.tick-add, .cell.tick-rem")).toHaveCount(0);
    await page.locator("#undo").evaluate((el) => el.click());
    await expect(cell(page, 37)).toHaveAttribute("data-notes", original);
    await expect(cell(page, 38)).toHaveAttribute("data-notes", present);
  });
}

test("a cancelled addition returns to net zero without a red ghost", async ({ page }) => {
  const t = await paintSetup(page, true);
  await t.lock();
  const samples = await cell(page, 37).evaluateHandle((el) => {
    const ghosts = [];
    const observer = new MutationObserver((records) => {
      ghosts.push(
        el.querySelectorAll(".ghost").length,
        ...records.map((r) => (/\bghost\b/.test(r.oldValue || "") ? 1 : 0))
      );
    });
    observer.observe(el, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"],
    });
    return { ghosts, stop: () => observer.disconnect() };
  });
  await t.down(37);
  await expect(cell(page, 37)).toHaveAttribute("data-notes", "5");
  await expect(pencil(page, 37, 5)).toHaveClass(/paint-added/);
  await t.cancel();
  await expect(cell(page, 37)).toHaveAttribute("data-notes", "");
  await expect(page.locator(".ghost, .paint-added, .tick-add, .tick-rem")).toHaveCount(0);
  await expect(page.locator("#undo")).toBeDisabled();
  const ghosts = await samples.evaluate((s) => {
    s.stop();
    return s.ghosts;
  });
  expect(ghosts.length).toBeGreaterThan(0);
  expect(ghosts.every((count) => count === 0)).toBe(true);
});
