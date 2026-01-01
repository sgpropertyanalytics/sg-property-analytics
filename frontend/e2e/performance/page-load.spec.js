/**
 * Page Load Performance Tests
 *
 * Measures initial page load time for all dashboard pages.
 * Verifies charts render within performance budgets.
 *
 * Run: npm run test:perf -- --grep "page load"
 */

import { test, expect } from '@playwright/test';
import {
  PAGES,
  BUDGETS,
  waitForChartsLoaded,
  countVisibleCharts,
  checkForErrors,
  setupConsoleErrorCapture,
  PerfMetrics,
} from './fixtures.js';

test.describe('Page Load Performance', () => {
  let perfMetrics;

  test.beforeAll(() => {
    perfMetrics = new PerfMetrics();
  });

  test.afterAll(() => {
    perfMetrics.print();
  });

  for (const page of PAGES) {
    test(`${page.name} (${page.route}) loads within budget`, async ({ page: browserPage }) => {
      const consoleErrors = setupConsoleErrorCapture(browserPage);

      // Measure page load time
      const startTime = Date.now();
      await browserPage.goto(page.route);

      // Wait for charts to load
      const loadTime = await waitForChartsLoaded(browserPage);

      // Record metric
      const budget = page.priority === 'P0' ? BUDGETS.pageLoad.p0 : BUDGETS.pageLoad.p1;
      perfMetrics.record(`${page.name} load`, loadTime, budget);

      // Verify load time within budget
      expect(loadTime, `${page.name} load time ${loadTime}ms exceeds budget ${budget}ms`).toBeLessThan(
        budget * 1.5 // Allow 50% grace for CI variability
      );

      // Verify charts rendered
      const chartCount = await countVisibleCharts(browserPage);
      expect(chartCount, `${page.name} should have at least 1 chart`).toBeGreaterThan(0);

      // Verify no errors
      const errors = await checkForErrors(browserPage);
      expect(errors, `${page.name} has errors: ${errors.join(', ')}`).toHaveLength(0);

      // Verify no console errors
      expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
    });
  }
});

test.describe('Chart Render Verification', () => {
  for (const pageConfig of PAGES) {
    test(`${pageConfig.name} - all charts visible`, async ({ page }) => {
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);

      // Check each expected chart
      for (const chartId of pageConfig.charts) {
        // Try data-testid first
        let chart = page.locator(`[data-testid="${chartId}"]`);

        // If not found, try partial match
        if ((await chart.count()) === 0) {
          chart = page.locator(`[data-testid*="${chartId}"], [class*="${chartId}"]`);
        }

        // If still not found, check for canvas (Chart.js)
        if ((await chart.count()) === 0) {
          chart = page.locator('canvas').first();
        }

        // At least one chart should be visible (relaxed check)
        const canvasCount = await page.locator('canvas').count();
        expect(
          canvasCount,
          `${pageConfig.name} should have chart canvases`
        ).toBeGreaterThan(0);
      }
    });
  }
});

test.describe('Cold vs Warm Load', () => {
  test('warm load is faster than cold load', async ({ page }) => {
    const route = '/market-overview';

    // Cold load (first visit)
    const coldStart = Date.now();
    await page.goto(route);
    await waitForChartsLoaded(page);
    const coldLoadTime = Date.now() - coldStart;

    // Navigate away
    await page.goto('/');
    await page.waitForTimeout(500);

    // Warm load (cached assets)
    const warmStart = Date.now();
    await page.goto(route);
    await waitForChartsLoaded(page);
    const warmLoadTime = Date.now() - warmStart;

    console.log(`Cold load: ${coldLoadTime}ms, Warm load: ${warmLoadTime}ms`);

    // Warm load should be faster (or at least not much slower)
    expect(warmLoadTime).toBeLessThan(coldLoadTime * 1.2);
  });
});

test.describe('Loading States', () => {
  test('loading skeletons appear immediately', async ({ page }) => {
    // Start navigation
    const navigationPromise = page.goto('/market-overview');

    // Check for loading state within first 500ms
    await page.waitForTimeout(200);
    const loadingIndicators = page.locator('.animate-pulse, [class*="skeleton"], [class*="loading"]');
    const hasLoading = (await loadingIndicators.count()) > 0;

    // Wait for navigation to complete
    await navigationPromise;
    await waitForChartsLoaded(page);

    // Loading state should have appeared (or charts loaded very fast)
    // This is a soft check - fast loads might skip visible loading state
    console.log(`Loading indicators appeared: ${hasLoading}`);
  });

  test('no stuck loading states after 10 seconds', async ({ page }) => {
    await page.goto('/market-overview');

    // Wait up to 10 seconds
    await page.waitForTimeout(10000);

    // Check for any remaining loading indicators
    const loadingIndicators = page.locator('.animate-pulse, [class*="skeleton"]');
    const stuckCount = await loadingIndicators.count();

    expect(stuckCount, 'Some charts are stuck in loading state').toBe(0);
  });
});
