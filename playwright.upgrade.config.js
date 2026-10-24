import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  testMatch: "upgrade.spec.js",
  globalSetup: "./e2e/upgrade-builds.js",
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "upgrade-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "upgrade-mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    { name: "upgrade-webkit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
});
