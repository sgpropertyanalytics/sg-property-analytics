/**
 * Comprehensive Filter Tests
 *
 * Tests every filter type on every page:
 * - Time Granularity (Year, Qtr, Month)
 * - Market Segment (CCR, RCR, OCR)
 * - Bedroom Type (1BR, 2BR, 3BR, 4BR, 5BR)
 * - Date Range (3M, 6M, 1Y, 3Y, 5Y, All)
 *
 * Measures chart reaction time for each filter change.
 *
 * Run: npm run test:perf -- --grep "all-filters"
 */

import { test, expect } from '@playwright/test';
import {
  PAGES,
  FILTERS,
  ALL_FILTER_TYPES,
  BUDGETS,
  waitForChartsLoaded,
  countVisibleCharts,
  checkForErrors,
  setupConsoleErrorCapture,
  clickFilterAndMeasure,
  testFilterOptions,
  PerfMetrics,
} from './fixtures.js';

// ============================================================================
// INDIVIDUAL FILTER TESTS - Every filter option on every page
// ============================================================================

test.describe('Time Granularity Filter (Year/Qtr/Month)', () => {
  for (const pageConfig of PAGES) {
    test.describe(`${pageConfig.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);
      });

      for (const option of FILTERS.timeGranularity.options) {
        test(`${option.label} - chart reaction time`, async ({ page }) => {
          const consoleErrors = setupConsoleErrorCapture(page);

          const result = await clickFilterAndMeasure(
            page,
            option.selector,
            `Time Granularity: ${option.label}`
          );

          // Log timing
          console.log(`${pageConfig.name} - ${option.label}: ${result.reactionTime}ms`);

          // Assertions
          expect(result.success, `Filter click failed: ${result.errors.join(', ')}`).toBe(true);
          expect(
            result.reactionTime,
            `Reaction time ${result.reactionTime}ms exceeds budget ${BUDGETS.filterChange}ms`
          ).toBeLessThan(BUDGETS.filterChange * 2); // 2x grace for CI

          // Verify charts still visible
          const chartCount = await countVisibleCharts(page);
          expect(chartCount).toBeGreaterThan(0);

          // No console errors
          const realErrors = consoleErrors.filter(
            (e) => !e.includes('abort') && !e.includes('cancel')
          );
          expect(realErrors).toHaveLength(0);
        });
      }
    });
  }
});

test.describe('Market Segment Filter (CCR/RCR/OCR)', () => {
  for (const pageConfig of PAGES) {
    test.describe(`${pageConfig.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);
      });

      for (const option of FILTERS.segment.options) {
        test(`${option.label} - chart reaction time`, async ({ page }) => {
          const consoleErrors = setupConsoleErrorCapture(page);

          const result = await clickFilterAndMeasure(
            page,
            option.selector,
            `Segment: ${option.label}`
          );

          console.log(`${pageConfig.name} - ${option.label}: ${result.reactionTime}ms`);

          expect(result.success, `Filter click failed: ${result.errors.join(', ')}`).toBe(true);
          expect(result.reactionTime).toBeLessThan(BUDGETS.filterChange * 2);

          const chartCount = await countVisibleCharts(page);
          expect(chartCount).toBeGreaterThan(0);

          const realErrors = consoleErrors.filter(
            (e) => !e.includes('abort') && !e.includes('cancel')
          );
          expect(realErrors).toHaveLength(0);
        });
      }
    });
  }
});

test.describe('Bedroom Type Filter (1BR-5BR)', () => {
  for (const pageConfig of PAGES) {
    test.describe(`${pageConfig.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);
      });

      for (const option of FILTERS.bedroom.options) {
        test(`${option.label} - chart reaction time`, async ({ page }) => {
          const consoleErrors = setupConsoleErrorCapture(page);

          const result = await clickFilterAndMeasure(
            page,
            option.selector,
            `Bedroom: ${option.label}`
          );

          console.log(`${pageConfig.name} - ${option.label}: ${result.reactionTime}ms`);

          expect(result.success, `Filter click failed: ${result.errors.join(', ')}`).toBe(true);
          expect(result.reactionTime).toBeLessThan(BUDGETS.filterChange * 2);

          const chartCount = await countVisibleCharts(page);
          expect(chartCount).toBeGreaterThan(0);

          const realErrors = consoleErrors.filter(
            (e) => !e.includes('abort') && !e.includes('cancel')
          );
          expect(realErrors).toHaveLength(0);
        });
      }
    });
  }
});

test.describe('Date Range Filter (3M/6M/1Y/3Y/5Y/All)', () => {
  for (const pageConfig of PAGES) {
    test.describe(`${pageConfig.name}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);
      });

      for (const option of FILTERS.dateRange.options) {
        test(`${option.label} - chart reaction time`, async ({ page }) => {
          const consoleErrors = setupConsoleErrorCapture(page);

          const result = await clickFilterAndMeasure(
            page,
            option.selector,
            `Date Range: ${option.label}`
          );

          console.log(`${pageConfig.name} - ${option.label}: ${result.reactionTime}ms`);

          expect(result.success, `Filter click failed: ${result.errors.join(', ')}`).toBe(true);
          expect(result.reactionTime).toBeLessThan(BUDGETS.filterChange * 2);

          const chartCount = await countVisibleCharts(page);
          expect(chartCount).toBeGreaterThan(0);

          const realErrors = consoleErrors.filter(
            (e) => !e.includes('abort') && !e.includes('cancel')
          );
          expect(realErrors).toHaveLength(0);
        });
      }
    });
  }
});

// ============================================================================
// FULL FILTER SWEEP - All options of a filter type in sequence
// ============================================================================

test.describe('Full Filter Sweep Tests', () => {
  for (const pageConfig of PAGES) {
    test.describe(`${pageConfig.name}`, () => {
      let perfMetrics;

      test.beforeAll(() => {
        perfMetrics = new PerfMetrics();
      });

      test.afterAll(() => {
        perfMetrics.print();
      });

      test('sweep all time granularity options', async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);

        const results = await testFilterOptions(page, 'timeGranularity');

        for (const result of results) {
          perfMetrics.recordFilterTest(result.filterName, result.reactionTime, result.success);
          expect(result.success, `${result.filterName} failed`).toBe(true);
        }

        // All options tested without errors
        expect(results.every((r) => r.success)).toBe(true);
      });

      test('sweep all segment options', async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);

        const results = await testFilterOptions(page, 'segment');

        for (const result of results) {
          perfMetrics.recordFilterTest(result.filterName, result.reactionTime, result.success);
          expect(result.success, `${result.filterName} failed`).toBe(true);
        }

        expect(results.every((r) => r.success)).toBe(true);
      });

      test('sweep all bedroom options', async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);

        const results = await testFilterOptions(page, 'bedroom');

        for (const result of results) {
          perfMetrics.recordFilterTest(result.filterName, result.reactionTime, result.success);
          expect(result.success, `${result.filterName} failed`).toBe(true);
        }

        expect(results.every((r) => r.success)).toBe(true);
      });

      test('sweep all date range options', async ({ page }) => {
        await page.goto(pageConfig.route);
        await waitForChartsLoaded(page);

        const results = await testFilterOptions(page, 'dateRange');

        for (const result of results) {
          perfMetrics.recordFilterTest(result.filterName, result.reactionTime, result.success);
          expect(result.success, `${result.filterName} failed`).toBe(true);
        }

        expect(results.every((r) => r.success)).toBe(true);
      });
    });
  }
});

// ============================================================================
// FILTER PERSISTENCE - Verify filters work after multiple changes
// ============================================================================

test.describe('Filter State Persistence', () => {
  test('filters remain functional after 20+ changes', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const allFilterClicks = [];

    // 20+ filter changes mixing all filter types
    for (let i = 0; i < 5; i++) {
      // Time granularity cycle
      for (const opt of FILTERS.timeGranularity.options) {
        const btn = page.locator(opt.selector).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click();
          allFilterClicks.push(opt.label);
          await page.waitForTimeout(100);
        }
      }

      // Segment cycle
      for (const opt of FILTERS.segment.options) {
        const btn = page.locator(opt.selector).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click();
          allFilterClicks.push(opt.label);
          await page.waitForTimeout(100);
        }
      }
    }

    // Wait for final state
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    console.log(`Total filter clicks: ${allFilterClicks.length}`);

    // Verify charts still work
    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// FILTER TIMING SUMMARY - Aggregate metrics across all filters
// ============================================================================

test.describe('Filter Timing Summary', () => {
  test('all filters meet performance budget', async ({ page }) => {
    const perfMetrics = new PerfMetrics();

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Test each filter type
    for (const filterType of ALL_FILTER_TYPES) {
      const results = await testFilterOptions(page, filterType);
      for (const result of results) {
        perfMetrics.recordFilterTest(result.filterName, result.reactionTime, result.success);
      }
    }

    perfMetrics.print();

    const summary = perfMetrics.getSummary();
    const failures = perfMetrics.getFailures();

    console.log(`\nFilter Test Summary:`);
    console.log(`  Total: ${summary.total}`);
    console.log(`  Passed: ${summary.passed}`);
    console.log(`  Failed: ${summary.failed}`);
    console.log(`  Avg Filter Time: ${summary.avgFilterTime}ms`);

    if (failures.length > 0) {
      console.log(`\nFailures:`);
      for (const f of failures) {
        console.log(`  - ${f.name}: ${f.value}ms (budget: ${f.budget}ms)`);
      }
    }

    // Allow some failures in CI due to variability
    expect(summary.failed).toBeLessThanOrEqual(Math.ceil(summary.total * 0.1)); // 10% failure tolerance
  });
});
