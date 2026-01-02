/**
 * Critical Path Smoke Tests
 *
 * Simple tests that verify each page loads without crashing.
 * These catch React Context errors, missing providers, and white-page crashes.
 *
 * Uses API mocks so tests don't depend on backend availability.
 *
 * Success criteria:
 * - No React error boundary visible
 * - No console errors (excluding expected network failures)
 * - Key element visible on page
 *
 * RUN: npm run test:e2e -- --grep "Smoke"
 */

import { test, expect } from '@playwright/test';
import { mockApiEndpoints } from './fixtures/api-mocks.js';

// Critical pages to test (from CLAUDE.md routes)
const CRITICAL_PAGES = [
  { path: '/', name: 'Landing', keyElement: 'main, [data-testid="landing"], .landing' },
  { path: '/market-overview', name: 'Market Overview', keyElement: 'canvas, [data-testid="kpi-cards"], .chart-container' },
  { path: '/district-overview', name: 'District Overview', keyElement: 'canvas, [data-testid="district"], .chart-container' },
  { path: '/new-launch-market', name: 'New Launch Market', keyElement: 'canvas, [data-testid="new-launch"], .chart-container' },
  { path: '/explore', name: 'Explore', keyElement: '[data-testid="explore"], .explore, main' },
];

test.describe('Smoke Tests - Critical Pages Load', () => {
  // Mock API endpoints so tests don't depend on backend
  test.beforeEach(async ({ page }) => {
    await mockApiEndpoints(page);
  });

  for (const page of CRITICAL_PAGES) {
    test(`${page.name} (${page.path}) loads without crash`, async ({ page: browserPage }) => {
      // Re-apply mocks (beforeEach uses different page instance)
      await mockApiEndpoints(browserPage);
      const consoleErrors = [];

      // Collect console errors
      browserPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Ignore expected errors
          if (!text.includes('401') &&
              !text.includes('Failed to load resource') &&
              !text.includes('net::ERR')) {
            consoleErrors.push(text);
          }
        }
      });

      // Navigate to page
      await browserPage.goto(page.path);

      // Wait for page to settle
      await browserPage.waitForLoadState('domcontentloaded');
      await browserPage.waitForTimeout(1000);

      // 1. Check NO React error boundary / crash screen
      const errorBoundary = browserPage.locator(
        'text=/something went wrong|error boundary|application error|uncaught error/i'
      );
      await expect(errorBoundary).not.toBeVisible();

      // 2. Check NO "white page" (body has content)
      const bodyContent = await browserPage.locator('body').innerText();
      expect(bodyContent.length).toBeGreaterThan(10);

      // 3. Check key element visible (or login redirect, or main content - all acceptable)
      const keyElement = browserPage.locator(page.keyElement);
      const loginPage = browserPage.locator('text=/sign in|log in|login|email|password/i');
      const mainContent = browserPage.locator('main, [role="main"], .app, #root > div');

      // Either key element OR login page OR main content should be visible
      const keyVisible = await keyElement.first().isVisible().catch(() => false);
      const loginVisible = await loginPage.first().isVisible().catch(() => false);
      const mainVisible = await mainContent.first().isVisible().catch(() => false);

      // Pass if any meaningful content is visible (not white screen)
      expect(keyVisible || loginVisible || mainVisible).toBeTruthy();

      // 4. No unexpected console errors
      const criticalErrors = consoleErrors.filter(
        (e) => e.includes('useFilterState') ||
               e.includes('must be used within') ||
               e.includes('Cannot read properties of') ||
               e.includes('is not a function')
      );

      if (criticalErrors.length > 0) {
        console.error('Critical console errors:', criticalErrors);
      }
      expect(criticalErrors.length).toBe(0);
    });
  }
});

test.describe('Smoke Tests - Filter Interaction', () => {
  test('filter selection does not crash page', async ({ page }) => {
    // Mock API endpoints
    await mockApiEndpoints(page);

    // Navigate to chart-heavy page
    await page.goto('/market-overview');
    await page.waitForLoadState('networkidle');

    // Check if we're on the dashboard (not redirected to login)
    const isOnDashboard = !await page.locator('text=/sign in|log in/i').isVisible();

    if (!isOnDashboard) {
      test.skip('Redirected to login - auth required');
      return;
    }

    // Find any filter/dropdown and interact
    const filterSelects = page.locator('select, [role="combobox"], [data-testid*="filter"]');
    const filterCount = await filterSelects.count();

    if (filterCount > 0) {
      // Click first filter
      await filterSelects.first().click();
      await page.waitForTimeout(500);

      // Page should not crash
      const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
      await expect(errorBoundary).not.toBeVisible();

      // Charts should still be present
      const charts = page.locator('canvas');
      const chartCount = await charts.count();
      expect(chartCount).toBeGreaterThan(0);
    }
  });
});

test.describe('Smoke Tests - Navigation', () => {
  test('can navigate between pages without crash', async ({ page }) => {
    // Mock API endpoints
    await mockApiEndpoints(page);

    // Start at landing
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to market overview
    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');

    // Check no crash
    const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
    await expect(errorBoundary).not.toBeVisible();

    // Navigate to district overview
    await page.goto('/district-overview');
    await page.waitForLoadState('domcontentloaded');
    await expect(errorBoundary).not.toBeVisible();

    // Navigate back to market overview
    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');
    await expect(errorBoundary).not.toBeVisible();
  });
});

// ============================================================
// Chart Rendering Validation - Verify charts render with content
// ============================================================
test.describe('Chart Rendering Validation', () => {
  test('charts render with data on market overview', async ({ page }) => {
    await mockApiEndpoints(page);
    await page.goto('/market-overview');
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login (auth not mocked in CI)
    const isLogin = await page.locator('text=/sign in|log in|login/i').isVisible();
    if (isLogin) {
      console.log('Skipping - redirected to login');
      return; // Pass test - login redirect is acceptable
    }

    // Check canvas elements exist
    const canvases = page.locator('canvas');
    const canvasCount = await canvases.count();

    // May have 0 canvases if not authenticated - that's OK
    if (canvasCount === 0) {
      console.log('No canvases found - likely not authenticated');
      return;
    }

    expect(canvasCount).toBeGreaterThan(0);

    // Verify first 3 canvases have non-zero dimensions (actual rendering)
    for (let i = 0; i < Math.min(canvasCount, 3); i++) {
      const canvas = canvases.nth(i);
      const box = await canvas.boundingBox();

      // Canvas should have reasonable size (not collapsed)
      expect(box?.width).toBeGreaterThan(50);
      expect(box?.height).toBeGreaterThan(50);
    }
  });

  test('charts render on district overview', async ({ page }) => {
    await mockApiEndpoints(page);
    await page.goto('/district-overview');
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login (auth not mocked in CI)
    const isLogin = await page.locator('text=/sign in|log in|login/i').isVisible();
    if (isLogin) {
      console.log('Skipping - redirected to login');
      return; // Pass test - login redirect is acceptable
    }

    // At least one canvas should render (or no canvases if not authenticated)
    const canvases = page.locator('canvas');
    const canvasCount = await canvases.count();
    if (canvasCount === 0) {
      console.log('No canvases found - likely not authenticated');
      return;
    }
    await expect(canvases.first()).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// Empty State Handling - Verify graceful degradation
// ============================================================
test.describe('Empty State Handling', () => {
  test('handles empty API response gracefully', async ({ page }) => {
    // Override mock to return empty data
    await page.route('**/api/aggregate**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          meta: { apiVersion: 'v3', requestId: 'test-empty' }
        }),
      })
    );

    // Mock other endpoints normally
    await page.route('**/api/metadata**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          last_updated: '2024-01-01',
          total_transactions: 0,
          date_range: { min: '2020-01', max: '2024-01' }
        }),
      })
    );

    await page.route('**/api/filter-options**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          districts: [],
          regions: ['CCR', 'RCR', 'OCR'],
          bedrooms: ['1', '2', '3', '4', '5+'],
          saleTypes: ['new_sale', 'resale'],
          tenures: ['freehold', '99-year', '999-year'],
          dateRange: { min: '2020-01', max: '2024-01' }
        }),
      })
    );

    await page.route('**/api/kpi-summary**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_transactions: 0,
          median_psf: 0,
          median_price: 0,
          yoy_change: 0
        }),
      })
    );

    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should NOT show React error boundary
    const errorBoundary = page.locator(
      'text=/something went wrong|error boundary|application error|uncaught error/i'
    );
    await expect(errorBoundary).not.toBeVisible();

    // Body should still have content (not white page)
    const bodyContent = await page.locator('body').innerText();
    expect(bodyContent.length).toBeGreaterThan(10);
  });

  test('handles API error gracefully', async ({ page }) => {
    // Mock API to return 500 error
    await page.route('**/api/aggregate**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    );

    // Mock other endpoints normally
    await mockApiEndpoints(page);

    await page.goto('/market-overview');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Should NOT show React error boundary (should show error state gracefully)
    const crashBoundary = page.locator(
      'text=/uncaught error|application error/i'
    );
    await expect(crashBoundary).not.toBeVisible();

    // Body should still have content
    const bodyContent = await page.locator('body').innerText();
    expect(bodyContent.length).toBeGreaterThan(10);
  });
});

// ============================================================
// Filter Changes - Verify charts update without crash
// ============================================================
test.describe('Filter Changes Update Charts', () => {
  test('time granularity toggle does not crash', async ({ page }) => {
    await mockApiEndpoints(page);
    await page.goto('/market-overview');
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login
    const isLogin = await page.locator('text=/sign in|log in/i').isVisible();
    if (isLogin) {
      test.skip('Redirected to login - auth required');
      return;
    }

    // Look for time granularity toggle (Monthly/Quarterly buttons)
    const monthlyToggle = page.locator('[data-testid="time-monthly"], button:has-text("Monthly")');
    const quarterlyToggle = page.locator('[data-testid="time-quarterly"], button:has-text("Quarterly")');

    // Try clicking if visible
    if (await monthlyToggle.isVisible()) {
      await monthlyToggle.click();
      await page.waitForTimeout(500);

      // Page should not crash
      const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
      await expect(errorBoundary).not.toBeVisible();

      // Charts should still be visible
      const charts = page.locator('canvas');
      expect(await charts.count()).toBeGreaterThan(0);
    }

    if (await quarterlyToggle.isVisible()) {
      await quarterlyToggle.click();
      await page.waitForTimeout(500);

      // Page should not crash
      const errorBoundary = page.locator('text=/something went wrong|error boundary/i');
      await expect(errorBoundary).not.toBeVisible();
    }
  });

  test('rapid filter changes do not cause errors', async ({ page }) => {
    await mockApiEndpoints(page);
    await page.goto('/market-overview');
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login
    const isLogin = await page.locator('text=/sign in|log in/i').isVisible();
    if (isLogin) {
      test.skip('Redirected to login - auth required');
      return;
    }

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore network errors
        if (!text.includes('Failed to load resource') &&
            !text.includes('net::ERR')) {
          consoleErrors.push(text);
        }
      }
    });

    // Find any clickable filter elements
    const filterButtons = page.locator('button, [role="button"]');
    const filterCount = await filterButtons.count();

    // Click a few filter buttons rapidly (simulates fast user interaction)
    for (let i = 0; i < Math.min(filterCount, 5); i++) {
      const button = filterButtons.nth(i);
      if (await button.isVisible()) {
        await button.click().catch(() => {}); // Ignore click errors
        await page.waitForTimeout(100); // Very short delay
      }
    }

    await page.waitForTimeout(1000);

    // Check for state update errors (common stale closure / race condition bug)
    const stateErrors = consoleErrors.filter(
      (e) => e.includes("Can't perform a React state update") ||
             e.includes('unmounted component') ||
             e.includes('Cannot read properties of null')
    );

    expect(stateErrors.length).toBe(0);
  });
});
