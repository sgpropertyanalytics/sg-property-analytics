/**
 * API Mocks for E2E Tests
 *
 * Stubs /api/* endpoints so frontend E2E tests don't depend on backend.
 * This makes the PR gate stable and fast.
 *
 * Usage in tests:
 *   import { mockApiEndpoints } from './fixtures/api-mocks.js';
 *
 *   test.beforeEach(async ({ page }) => {
 *     await mockApiEndpoints(page);
 *   });
 */

// Minimal mock data for smoke tests
const MOCK_DATA = {
  metadata: {
    last_updated: '2024-01-01',
    total_transactions: 50000,
    date_range: { min: '2020-01-01', max: '2024-01-01' },
  },

  filterOptions: {
    districts: ['D01', 'D02', 'D03', 'D04', 'D05'],
    regions: ['CCR', 'RCR', 'OCR'],
    bedrooms: ['1BR', '2BR', '3BR', '4BR', '5BR+'],
    saleTypes: ['New Sale', 'Resale'],
    tenures: ['99-year', 'Freehold'],
  },

  kpiSummary: {
    total_transactions: 1234,
    median_psf: 1850,
    median_price: 1250000,
    yoy_change: 5.2,
  },

  aggregate: {
    data: [
      { month: '2024-01', count: 100, median_psf: 1800 },
      { month: '2024-02', count: 120, median_psf: 1850 },
      { month: '2024-03', count: 110, median_psf: 1820 },
    ],
  },

  // Empty but valid responses for other endpoints
  emptyList: { data: [], total: 0, page: 1, limit: 20 },
};

/**
 * Mock all API endpoints
 * @param {import('@playwright/test').Page} page
 */
export async function mockApiEndpoints(page) {
  // Metadata
  await page.route('**/api/metadata', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.metadata),
    })
  );

  // Filter options
  await page.route('**/api/filter-options', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.filterOptions),
    })
  );

  // KPI Summary
  await page.route('**/api/kpi-summary**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.kpiSummary),
    })
  );

  // Aggregate endpoint (charts)
  await page.route('**/api/aggregate**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.aggregate),
    })
  );

  // Transactions list
  await page.route('**/api/transactions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.emptyList),
    })
  );

  // Projects list
  await page.route('**/api/projects**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DATA.emptyList),
    })
  );

  // Catch-all for other /api/* endpoints
  await page.route('**/api/**', (route) => {
    // Don't intercept if already handled above
    if (route.request().url().includes('/api/metadata') ||
        route.request().url().includes('/api/filter-options') ||
        route.request().url().includes('/api/kpi-summary') ||
        route.request().url().includes('/api/aggregate') ||
        route.request().url().includes('/api/transactions') ||
        route.request().url().includes('/api/projects')) {
      return route.continue();
    }

    // Return empty success for unknown endpoints
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], message: 'mocked' }),
    });
  });
}

/**
 * Mock API with custom responses
 * @param {import('@playwright/test').Page} page
 * @param {Object} overrides - Custom responses by endpoint
 */
export async function mockApiWithOverrides(page, overrides = {}) {
  await mockApiEndpoints(page);

  for (const [endpoint, response] of Object.entries(overrides)) {
    await page.route(`**/api/${endpoint}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
      })
    );
  }
}

/**
 * Mock API failure for testing error states
 * @param {import('@playwright/test').Page} page
 * @param {string} endpoint - Endpoint to fail (e.g., 'metadata')
 * @param {number} status - HTTP status code
 */
export async function mockApiFailure(page, endpoint, status = 500) {
  await page.route(`**/api/${endpoint}**`, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Mocked failure' }),
    })
  );
}
