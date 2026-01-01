/**
 * Playwright Configuration
 *
 * SETUP:
 *   npm install -D @playwright/test
 *   npx playwright install
 *
 * RUN:
 *   npm run test:e2e          # All E2E tests
 *   npm run test:perf         # Performance tests only
 *   npm run test:perf:headed  # Performance tests with browser visible
 *   npx playwright test --ui  # Interactive mode
 */

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './e2e',
  timeout: 60000, // 60s for performance tests
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
};

export default config;
