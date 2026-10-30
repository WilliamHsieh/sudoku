import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || 4173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/sudoku/`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: [
        /mobile\.spec\.js/,
        /options-exit\.spec\.js/,
        /(?:upgrade|update-regressions)\.spec\.js/,
      ],
      teardown: "paint-timing",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch:
        /(?:board-lines|options-(input-)?focus|sheet-exit|background-(?:cover|blur-policy)|keypad-layout\.mobile)\.spec\.js/,
      teardown: "paint-timing",
      use: { browserName: "webkit" },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.js/,
      teardown: "paint-timing",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
        userAgent: devices["iPhone 13"].userAgent,
      },
    },
    {
      // A shared teardown project runs after all three projects have stopped,
      // even if a test failed. These compositor checks need real paint frames
      // without competing test workers; serial mode alone cannot ensure that.
      // Playwright runs all four cases once per shard, outside shard filtering.
      name: "paint-timing",
      testMatch: /options-exit\.spec\.js/,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/sudoku/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
