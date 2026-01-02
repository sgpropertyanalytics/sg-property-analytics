/**
 * Playwright Configuration
 *
 * SETUP:
 *   npm install -D @playwright/test
 *   npx playwright install
 *
 * RUN:
 *   npm run test:e2e           # Smoke tests only (PR gate)
 *   npm run test:e2e:full      # All E2E tests including performance
 *   npm run test:perf          # Performance tests only
 *   npm run test:perf:headed   # Performance tests with browser visible
 *   npx playwright test --ui   # Interactive mode
 */

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './e2e',

  // Timeouts - fail fast, don't hang
  timeout: 30000, // 30s per test (was 60s)
  expect: {
    timeout: 10000, // 10s for expect() assertions
  },

  // Retries - keep low for fast feedback
  retries: process.env.CI ? 1 : 0, // Was 2, now 1

  // Workers
  workers: process.env.CI ? 1 : undefined,

  // Fail fast - stop on first failure in CI
  maxFailures: process.env.CI ? 3 : undefined,

  // Reporter
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: process.env.BASE_URL || (process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',

    // Action timeouts
    actionTimeout: 10000, // 10s for clicks, fills, etc.
    navigationTimeout: 15000, // 15s for page.goto()
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
};

export default config;
