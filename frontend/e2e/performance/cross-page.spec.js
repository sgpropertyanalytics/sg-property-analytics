/**
 * Cross-Page Navigation Tests
 *
 * Tests navigating between all pages while:
 * - Applying filters before navigation
 * - Applying filters after navigation
 * - Rapid page switching with filter changes
 * - Filter state across page transitions
 *
 * Run: npm run test:perf -- --grep "cross-page"
 */

import { test, expect } from '@playwright/test';
import {
  PAGES,
  FILTERS,
  BUDGETS,
  waitForChartsLoaded,
  countVisibleCharts,
  checkForErrors,
  setupConsoleErrorCapture,
  clickFilterAndMeasure,
  navigateAndVerify,
  PerfMetrics,
} from './fixtures.js';

// ============================================================================
// SEQUENTIAL PAGE NAVIGATION WITH FILTERS
// ============================================================================

test.describe('Cross-Page Navigation', () => {
  let perfMetrics;

  test.beforeAll(() => {
    perfMetrics = new PerfMetrics();
  });

  test.afterAll(() => {
    perfMetrics.print();
  });

  test('navigate through all pages sequentially', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);
    let previousPage = 'Start';

    for (const pageConfig of PAGES) {
      const startTime = Date.now();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      const navTime = Date.now() - startTime;

      perfMetrics.recordNavigation(previousPage, pageConfig.name, navTime);
      previousPage = pageConfig.name;

      // Verify page loaded correctly
      const chartCount = await countVisibleCharts(page);
      expect(chartCount, `${pageConfig.name} has no charts`).toBeGreaterThan(0);

      const errors = await checkForErrors(page);
      expect(errors, `${pageConfig.name} has errors`).toHaveLength(0);

      console.log(`${pageConfig.name}: ${navTime}ms, ${chartCount} charts`);
    }

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('navigate with filter change on each page', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    for (const pageConfig of PAGES) {
      // Navigate to page
      const navResult = await navigateAndVerify(page, pageConfig.route, pageConfig.name);
      expect(navResult.success, `${pageConfig.name} failed to load`).toBe(true);

      perfMetrics.recordNavigation('Previous', pageConfig.name, navResult.navigationTime);

      // Apply a filter
      const filterResult = await clickFilterAndMeasure(
        page,
        FILTERS.segment.options[0].selector, // CCR
        `${pageConfig.name}: CCR filter`
      );

      if (filterResult.success) {
        perfMetrics.recordFilterTest(
          `${pageConfig.name}: CCR`,
          filterResult.reactionTime,
          filterResult.success
        );
      }

      // Apply another filter
      const filterResult2 = await clickFilterAndMeasure(
        page,
        FILTERS.timeGranularity.options[0].selector, // Year
        `${pageConfig.name}: Year filter`
      );

      if (filterResult2.success) {
        perfMetrics.recordFilterTest(
          `${pageConfig.name}: Year`,
          filterResult2.reactionTime,
          filterResult2.success
        );
      }

      console.log(
        `${pageConfig.name}: Nav ${navResult.navigationTime}ms, Filter1 ${filterResult.reactionTime}ms, Filter2 ${filterResult2.reactionTime}ms`
      );
    }

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// RAPID CROSS-PAGE NAVIGATION
// ============================================================================

test.describe('Rapid Cross-Page Navigation', () => {
  test('rapid navigation cycle (5x through all pages)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);
    const navigationTimes = [];

    for (let cycle = 0; cycle < 5; cycle++) {
      console.log(`\nCycle ${cycle + 1}/5`);

      for (const pageConfig of PAGES) {
        const startTime = Date.now();
        await page.goto(pageConfig.route);

        // Don't wait for full load on rapid navigation
        await page.waitForTimeout(300);

        navigationTimes.push({
          cycle,
          page: pageConfig.name,
          time: Date.now() - startTime,
        });
      }
    }

    // Final page should load correctly
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    // Calculate average navigation time
    const avgTime = Math.round(
      navigationTimes.reduce((a, b) => a + b.time, 0) / navigationTimes.length
    );
    console.log(`\nAverage rapid navigation time: ${avgTime}ms`);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('navigation with filter changes mid-cycle', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    for (let cycle = 0; cycle < 3; cycle++) {
      console.log(`\nCycle ${cycle + 1}/3`);

      for (const pageConfig of PAGES) {
        await page.goto(pageConfig.route);
        await page.waitForTimeout(500); // Partial load

        // Quick filter change
        const filterBtn = page.locator(FILTERS.segment.options[cycle % 3].selector).first();
        if (await filterBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await filterBtn.click();
          await page.waitForTimeout(200);
        }
      }
    }

    // Final verification
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// PAGE PAIRS - Test navigation between specific page pairs
// ============================================================================

test.describe('Page Pair Navigation', () => {
  const pagePairs = [
    { from: '/market-overview', to: '/district-overview' },
    { from: '/district-overview', to: '/new-launch-market' },
    { from: '/new-launch-market', to: '/supply-inventory' },
    { from: '/supply-inventory', to: '/explore' },
    { from: '/explore', to: '/value-check' },
    { from: '/value-check', to: '/exit-risk' },
    { from: '/exit-risk', to: '/market-overview' },
  ];

  for (const pair of pagePairs) {
    test(`${pair.from} → ${pair.to} with filters`, async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page);

      // Load first page
      await page.goto(pair.from);
      await waitForChartsLoaded(page);

      // Apply filters on first page
      const ccrBtn = page.locator(FILTERS.segment.options[0].selector).first();
      if (await ccrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await ccrBtn.click();
        await page.waitForLoadState('networkidle');
      }

      const yearBtn = page.locator(FILTERS.timeGranularity.options[0].selector).first();
      if (await yearBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await yearBtn.click();
        await page.waitForLoadState('networkidle');
      }

      // Navigate to second page
      const startNav = Date.now();
      await page.goto(pair.to);
      await waitForChartsLoaded(page);
      const navTime = Date.now() - startNav;

      console.log(`${pair.from} → ${pair.to}: ${navTime}ms`);

      // Verify second page works
      const chartCount = await countVisibleCharts(page);
      expect(chartCount).toBeGreaterThan(0);

      const errors = await checkForErrors(page);
      expect(errors).toHaveLength(0);

      // Apply filter on second page
      const rcrBtn = page.locator(FILTERS.segment.options[1].selector).first();
      if (await rcrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const startFilter = Date.now();
        await rcrBtn.click();
        await page.waitForLoadState('networkidle');
        const filterTime = Date.now() - startFilter;

        console.log(`  Filter on ${pair.to}: ${filterTime}ms`);
        expect(filterTime).toBeLessThan(BUDGETS.filterChange * 2);
      }

      const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
      expect(realErrors).toHaveLength(0);
    });
  }
});

// ============================================================================
// BACK/FORWARD NAVIGATION WITH FILTERS
// ============================================================================

test.describe('Browser History Navigation', () => {
  test('back/forward preserves chart functionality', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Build navigation history
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Apply filter
    const ccrBtn = page.locator(FILTERS.segment.options[0].selector).first();
    if (await ccrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ccrBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await page.goto('/district-overview');
    await waitForChartsLoaded(page);

    await page.goto('/new-launch-market');
    await waitForChartsLoaded(page);

    // Go back twice
    await page.goBack();
    await waitForChartsLoaded(page);

    let chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    await page.goBack();
    await waitForChartsLoaded(page);

    chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    // Apply filter after going back
    const rcrBtn = page.locator(FILTERS.segment.options[1].selector).first();
    if (await rcrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await rcrBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Go forward
    await page.goForward();
    await waitForChartsLoaded(page);

    chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('rapid back/forward stress test', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Build history
    for (const pageConfig of PAGES.slice(0, 4)) {
      await page.goto(pageConfig.route);
      await page.waitForTimeout(300);
    }

    // Rapid back/forward
    for (let i = 0; i < 10; i++) {
      await page.goBack();
      await page.waitForTimeout(100);
    }

    for (let i = 0; i < 5; i++) {
      await page.goForward();
      await page.waitForTimeout(100);
    }

    // Final verification
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// INTERRUPTED NAVIGATION
// ============================================================================

test.describe('Interrupted Navigation', () => {
  test('interrupting navigation does not cause errors', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    // Start navigation, then interrupt
    const nav1 = page.goto('/market-overview');
    await page.waitForTimeout(100);
    await page.goto('/district-overview'); // Interrupt

    try {
      await nav1;
    } catch {
      // Expected - navigation was interrupted
    }

    await waitForChartsLoaded(page);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('filter change during navigation does not cause errors', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Start filter change
    const ccrBtn = page.locator(FILTERS.segment.options[0].selector).first();
    if (await ccrBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ccrBtn.click();
      // Don't wait - immediately navigate
      await page.goto('/district-overview');
    }

    await waitForChartsLoaded(page);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// CROSS-PAGE TIMING SUMMARY
// ============================================================================

test.describe('Cross-Page Timing Summary', () => {
  test('complete navigation + filter workflow', async ({ page }) => {
    const perfMetrics = new PerfMetrics();
    const consoleErrors = setupConsoleErrorCapture(page);

    let previousPage = 'Start';

    for (const pageConfig of PAGES) {
      // Navigate
      const navStart = Date.now();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      const navTime = Date.now() - navStart;

      perfMetrics.recordNavigation(previousPage, pageConfig.name, navTime);

      // Apply segment filter
      const segmentBtn = page.locator(FILTERS.segment.options[0].selector).first();
      if (await segmentBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const filterStart = Date.now();
        await segmentBtn.click();
        await page.waitForLoadState('networkidle');
        await waitForChartsLoaded(page);
        const filterTime = Date.now() - filterStart;

        perfMetrics.recordFilterTest(`${pageConfig.name}: Segment`, filterTime, true);
      }

      // Apply bedroom filter
      const bedroomBtn = page.locator(FILTERS.bedroom.options[1].selector).first();
      if (await bedroomBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const filterStart = Date.now();
        await bedroomBtn.click();
        await page.waitForLoadState('networkidle');
        await waitForChartsLoaded(page);
        const filterTime = Date.now() - filterStart;

        perfMetrics.recordFilterTest(`${pageConfig.name}: Bedroom`, filterTime, true);
      }

      // Apply date filter
      const dateBtn = page.locator(FILTERS.dateRange.options[2].selector).first(); // 1Y
      if (await dateBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        const filterStart = Date.now();
        await dateBtn.click();
        await page.waitForLoadState('networkidle');
        await waitForChartsLoaded(page);
        const filterTime = Date.now() - filterStart;

        perfMetrics.recordFilterTest(`${pageConfig.name}: Date`, filterTime, true);
      }

      previousPage = pageConfig.name;
    }

    perfMetrics.print();

    const summary = perfMetrics.getSummary();
    console.log(`\n=== Cross-Page Summary ===`);
    console.log(`Total tests: ${summary.total}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Avg Navigation: ${summary.avgNavigationTime}ms`);
    console.log(`Avg Filter: ${summary.avgFilterTime}ms`);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);

    // Allow 10% failure for CI variability
    expect(summary.failed).toBeLessThanOrEqual(Math.ceil(summary.total * 0.1));
  });
});
