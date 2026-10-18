import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: 'node serve.mjs',
    port: PORT,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.mjs/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      testMatch: /desktop\.spec\.mjs/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
