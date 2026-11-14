import { test, expect } from "@playwright/test";
import { solved, resumeTarget } from "./bank-fixture.js";

for (const width of [390, 1280]) {
  test(`bank result layout, feedback and Next at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await solved(page, { count: 6 });
    await expect(page.locator(".sv-panel dt")).toHaveText(["vs average", "unlock L4"]);
    await expect(page.locator(".sv-panel dd").last()).toHaveText("7/10");
    await expect(page.getByRole("button", { name: "Next: L3" })).toBeVisible();
    await page.getByRole("button", { name: "輕鬆", exact: true }).click();
    await expect(page.getByRole("button", { name: "輕鬆", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("sudoku-bank-records-v1"))
              .events.filter((e) => e.type === "feedback")
              .at(-1)?.feedback
        )
      )
      .toBe("light");
    await page.getByRole("button", { name: "輕鬆", exact: true }).click();
    await expect(page.getByRole("button", { name: "輕鬆", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await page.locator("#sv-h").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".sv-panel")).toHaveCount(0);
    await expect(page.locator(".board")).toBeVisible();
  });
  test(`solved board rejects all game input at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await solved(page);
    const before = await page.locator(".board").innerText();
    for (const key of [
      "1",
      "ArrowLeft",
      "Backspace",
      "Delete",
      "Control+z",
      "Control+y",
      "p",
      "Shift+1",
      "Escape",
    ])
      await page.keyboard.press(key);
    await page.locator(".board > .cell").nth(0).click({ force: true });
    await expect(page.locator(".board")).toHaveText(before);
    await expect(page.locator(".paused-cover")).toHaveCount(0);
  });
  test(`body Enter starts Next; More remains available after solve at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await solved(page);
    await expect(page.locator(".game-controls")).toHaveCount(0);
    await page.getByRole("button", { name: "More", exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole("button", { name: "Restart puzzle", exact: true })).toHaveCount(0);
    await expect(page.locator("#opt-custom")).toHaveCount(0);
    await expect(page.locator("#opt-theme")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator("dialog.opts")).not.toBeVisible();
    await page.locator("#sv-h").focus();
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("Enter");
    await expect(page.locator(".sv-panel")).toHaveCount(0);
  });
}
for (const variant of [
  { name: "S1 top", count: 6, labels: ["vs average", "unlock L4"], third: "7/10" },
  {
    name: "S3 E/M/H",
    count: 1,
    mode: "easy",
    labels: ["vs average", "day streak", "puzzle level"],
    third: "L3",
  },
  {
    name: "S4 L8",
    level: 8,
    highest: 8,
    count: 1,
    labels: ["vs average", "L8 solved"],
    third: "2",
  },
  { name: "S4b below", highest: 4, count: 1, labels: ["vs average", "L3 solved"], third: "2" },
  { name: "S4c L2", level: 2, count: 1, labels: ["vs average", "L2 solved"], third: "2" },
  { name: "S4d first", level: 8, highest: 8, labels: ["L8 solved"], third: "1" },
  { name: "S5 custom", custom: true, labels: [], third: null },
  {
    name: "S7 hinted top",
    hinted: true,
    count: 6,
    labels: ["vs average", "unlock L4"],
    third: "6/10",
  },
  {
    name: "S7 hinted below",
    hinted: true,
    highest: 4,
    count: 1,
    labels: ["vs average", "L3 solved"],
    third: "2",
  },
  {
    name: "S7 hinted L8",
    hinted: true,
    level: 8,
    highest: 8,
    count: 1,
    labels: ["vs average", "L8 solved"],
    third: "2",
  },
  {
    name: "S8 hinted E/M/H",
    hinted: true,
    mode: "easy",
    count: 1,
    labels: ["vs average", "day streak", "puzzle level"],
    third: "L3",
  },
])
  test(`${variant.name}: exact cells and feeling visibility`, async ({ page }) => {
    await solved(page, variant);
    await expect(page.locator(".sv-panel dt")).toHaveText(variant.labels);
    if (variant.third) await expect(page.locator(".sv-panel dd").last()).toHaveText(variant.third);
    await expect(page.locator(".sv-feel")).toHaveCount(variant.hinted || variant.custom ? 0 : 1);
    await expect(page.locator(".sv-panel")).not.toContainText("這題用了提示");
  });
test("S6 resumes the most recently played other unfinished game", async ({ page }) => {
  await solved(page, { extra: true });
  await page.getByRole("button", { name: "Resume · L3", exact: true }).click();
  await expect(page.locator(".sv-panel")).toHaveCount(0);
  await expect(page.locator("[data-time]").first()).toContainText("2:03");
});
test("autofill completion still produces one solved panel", async ({ page }) => {
  await resumeTarget(page);
  await page.locator(".board").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Tab");
  await expect(page.locator(".sv-panel")).toHaveCount(1);
});
for (const action of ["tap", "button", "Enter"])
  test(`S2 unlock closes by ${action} and only first Enter dismisses`, async ({ page }) => {
    await solved(page, { count: 9 });
    const overlay = page.getByRole("dialog", { name: /L4 已解鎖/ });
    await expect(overlay).toBeVisible();
    await expect(page.locator(".sv-panel dd").last()).toHaveText("L4");
    if (action === "tap") await overlay.click({ position: { x: 10, y: 10 } });
    else if (action === "button") await overlay.getByRole("button", { name: "繼續" }).click();
    else await page.keyboard.press("Enter");
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next: L4" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".header .t1")).toHaveText("L4");
    await expect(overlay).toHaveCount(0);
  });
test("unlock reduced motion shows end state with focus contained", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await solved(page, { count: 9 });
  const overlay = page.locator(".unlock-overlay");
  await expect(overlay.locator(".lock-wrap")).toBeHidden();
  expect(await overlay.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.keyboard.press("Tab");
  await expect(overlay.getByRole("button", { name: "繼續" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(overlay).toHaveCount(0);
  await expect(page.locator("#sv-h")).toBeFocused();
});
test("hinted tenth and replay completions do not show unlock overlay", async ({ page }) => {
  await solved(page, { count: 9, hinted: true });
  await expect(page.locator(".unlock-overlay")).toHaveCount(0);
  await expect(page.locator(".sv-panel dd").last()).toHaveText("9/10");
});

test("failed feeling persistence leaves the chip unchanged", async ({ page }) => {
  await solved(page);
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sudoku-bank-records-v1") throw new Error("Storage full");
      return write.call(this, key, value);
    };
  });
  const chip = page.getByRole("button", { name: "輕鬆", exact: true });
  await chip.click();
  await expect(page.locator(".toast")).toContainText("Could not save your feedback");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});
test("holding Enter through unlock dismissal does not start Next", async ({ page }) => {
  await solved(page, { count: 9 });
  await page.keyboard.down("Enter");
  await expect(page.locator(".unlock-overlay")).toHaveCount(0);
  await page.keyboard.down("Enter");
  await expect(page.getByRole("button", { name: "Next: L4" })).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator(".header .t1")).toHaveText("L4");
});

test("unlocking L8 shows its name and Next target", async ({ page }) => {
  await solved(page, { level: 7, highest: 7, count: 9 });
  const overlay = page.getByRole("dialog", { name: /L8 已解鎖/ });
  await expect(overlay).toContainText("高階強制推理");
  await expect(overlay.locator(".note")).toHaveText("L8");
  await overlay.click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("button", { name: "Next: L8" })).toBeVisible();
});
