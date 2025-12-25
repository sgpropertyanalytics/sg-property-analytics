/**
 * Playwright Configuration
 *
 * SETUP:
 *   npm install -D @playwright/test
 *   npx playwright install
 *
 * RUN:
 *   npm run test:e2e
 *   npx playwright test
 *   npx playwright test --ui  (interactive mode)
 */

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
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
