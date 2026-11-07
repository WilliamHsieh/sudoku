import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, colorScheme: "light" });

test("custom editor preserves safe-area clearance and stable geometry in both directions", async ({
  page,
}) => {
  const client = await page.context().newCDPSession(page);
  // Browser environment emulation, not an injected stylesheet or status bar.
  await client.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 62, bottom: 34, left: 0, right: 0 },
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Custom puzzle", exact: true }).click();
  await page
    .locator(".journal-view")
    .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  await expect(page.locator("main")).toHaveCSS("padding-top", "62px");
  await expect(page.locator("main")).toHaveCSS("padding-bottom", "34px");
  await expect
    .poll(() => page.locator(".input-board").boundingBox())
    .toEqual({ x: 24, y: 156, width: 354, height: 354 });
  const before = await page.locator(".input-board").boundingBox();
  const footer = await page.locator(".action-panel").boundingBox();
  const header = await page
    .getByRole("heading", { name: "Custom puzzle", exact: true })
    .boundingBox();
  expect(header.y).toBeGreaterThanOrEqual(62);
  const tabs = await page.locator(".input-modes").boundingBox();
  const headerBox = await page.locator(".draft-header").boundingBox();
  expect(tabs.y - headerBox.y - headerBox.height).toBe(0);
  for (const mode of ["Paste puzzle", "Fill board", "Paste puzzle", "Fill board"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect.poll(() => page.locator(".input-board").boundingBox()).toEqual(before);
    expect(await page.locator(".action-panel").boundingBox()).toEqual(footer);
    expect(
      await page
        .locator(".editor-body")
        .evaluate((el) => [el.scrollTop, el.scrollHeight - el.clientHeight])
    ).toEqual([0, 0]);
  }
  for (const control of await page
    .locator(".editor-tools button, .draft-key, .action-panel button")
    .all()) {
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(402);
    expect(box.y + box.height).toBeLessThanOrEqual(874 - 34);
  }
  expect(
    await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio, scrollX, scrollY])
  ).toEqual([402, 874, 3, 0, 0]);
});
