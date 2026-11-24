import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 13"], browserName: "webkit" });

test("locked L4 stays neutral after returning from L3", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Choose L1–L8" }).tap();
  await page.getByRole("button", { name: /^L3 / }).tap();
  await expect(page.getByRole("heading", { name: "Level 3" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).tap();
  const locked = page.getByRole("button", { name: /^L4 / });
  await expect(locked).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await locked.tap({ force: true });
  await expect(page.locator(".toast")).toContainText("解鎖 L4");
  await expect(locked).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});
