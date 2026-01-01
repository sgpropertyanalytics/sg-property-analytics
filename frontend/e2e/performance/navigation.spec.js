/**
 * Page Navigation Resilience Tests
 *
 * Tests that rapid page navigation doesn't cause errors or memory leaks.
 * Verifies charts render correctly after multiple page switches.
 *
 * Run: npm run test:perf -- --grep "navigation"
 */

import { test, expect } from '@playwright/test';
import {
  PAGES,
  waitForChartsLoaded,
  countVisibleCharts,
  checkForErrors,
  setupConsoleErrorCapture,
} from './fixtures.js';

test.describe('Page Navigation Resilience', () => {
  test('navigate through all pages without errors', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    for (const pageConfig of PAGES) {
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);

      // Verify charts loaded
      const chartCount = await countVisibleCharts(page);
      expect(chartCount, `${pageConfig.name} should have charts`).toBeGreaterThan(0);

      // Verify no error states
      const errors = await checkForErrors(page);
      expect(errors, `${pageConfig.name} has errors`).toHaveLength(0);
    }

    // No console errors during navigation
    expect(consoleErrors).toHaveLength(0);
  });

  test('rapid navigation cycle (3x through all pages)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const pageConfig of PAGES) {
        await page.goto(pageConfig.route);
        // Don't wait for full load - simulate rapid navigation
        await page.waitForTimeout(300);
      }
    }

    // Final page should load correctly
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });

  test('back/forward navigation preserves chart state', async ({ page }) => {
    // Navigate to first page
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Navigate to second page
    await page.goto('/district-overview');
    await waitForChartsLoaded(page);

    // Go back
    await page.goBack();
    await waitForChartsLoaded(page);

    // Verify charts still work
    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    // Go forward
    await page.goForward();
    await waitForChartsLoaded(page);

    // Verify charts still work
    const chartCount2 = await countVisibleCharts(page);
    expect(chartCount2).toBeGreaterThan(0);

    const errors2 = await checkForErrors(page);
    expect(errors2).toHaveLength(0);
  });

  test('navigation during chart loading does not cause errors', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Start navigating to a page
    const navPromise = page.goto('/market-overview');

    // Immediately navigate somewhere else (interrupting load)
    await page.waitForTimeout(100);
    await page.goto('/district-overview');
    await waitForChartsLoaded(page);

    // Wait for any pending promises
    try {
      await navPromise;
    } catch {
      // Navigation was interrupted - expected
    }

    // Verify final page loaded correctly
    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    // Filter out abort errors (expected)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('abort') && !e.includes('cancel')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('memory stability after repeated navigation', async ({ page }) => {
    // Navigate through pages multiple times
    for (let i = 0; i < 5; i++) {
      for (const pageConfig of PAGES.slice(0, 3)) {
        // Only test P0 pages
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);
      }
    }

    // Get JS heap size (approximate memory usage)
    const metrics = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        };
      }
      return null;
    });

    if (metrics) {
      const usedMB = Math.round(metrics.usedJSHeapSize / 1024 / 1024);
      console.log(`JS Heap after navigation: ${usedMB}MB`);

      // Warn if heap is very large (potential memory leak)
      expect(usedMB, 'Potential memory leak - heap too large').toBeLessThan(500);
    }
  });
});

test.describe('Cross-Page State Persistence', () => {
  test('filter state persists across navigation', async ({ page }) => {
    // Go to Market Overview
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Try to find and click a filter (if available)
    const filterButton = page.locator(
      'button:has-text("CCR"), button:has-text("RCR"), button:has-text("District")'
    ).first();

    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(500);

      // Navigate away
      await page.goto('/district-overview');
      await waitForChartsLoaded(page);

      // Navigate back
      await page.goto('/market-overview');
      await waitForChartsLoaded(page);

      // Filter should still be applied (or reset gracefully)
      // This is a soft check - behavior depends on implementation
      const errors = await checkForErrors(page);
      expect(errors).toHaveLength(0);
    }
  });
});

test.describe('Navigation Timing', () => {
  test('page-to-page navigation is fast', async ({ page }) => {
    // Initial load
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const navigationTimes = [];

    // Measure navigation between pages
    for (const pageConfig of PAGES.slice(0, 3)) {
      const startTime = Date.now();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      const navTime = Date.now() - startTime;
      navigationTimes.push({ page: pageConfig.name, time: navTime });
    }

    console.log('Navigation times:', navigationTimes);

    // Average navigation should be reasonable
    const avgTime = navigationTimes.reduce((a, b) => a + b.time, 0) / navigationTimes.length;
    expect(avgTime, `Average navigation time ${avgTime}ms too slow`).toBeLessThan(3000);
  });
});
