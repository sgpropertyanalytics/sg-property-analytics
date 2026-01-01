/**
 * Filter Combination Stress Tests
 *
 * Tests multiple filters applied simultaneously:
 * - Single filter isolation
 * - Two-filter combinations
 * - Three-filter combinations
 * - All filters at once
 * - Rapid filter combination changes
 *
 * Run: npm run test:perf -- --grep "combinations"
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
  testFilterCombination,
  rapidFilterTest,
  generateFilterCombinations,
  PerfMetrics,
} from './fixtures.js';

// ============================================================================
// FILTER COMBINATIONS ON SINGLE PAGE
// ============================================================================

test.describe('Filter Combinations - Market Overview', () => {
  const combinations = generateFilterCombinations();
  let perfMetrics;

  test.beforeAll(() => {
    perfMetrics = new PerfMetrics();
  });

  test.afterAll(() => {
    perfMetrics.print();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/market-overview');
    await waitForChartsLoaded(page);
  });

  for (const combo of combinations) {
    const comboName = combo.map((c) => `${c.filterType}:${c.optionLabel}`).join(' + ');

    test(`${comboName}`, async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page);

      const result = await testFilterCombination(page, combo);

      perfMetrics.record(`Combo: ${comboName}`, result.totalTime, BUDGETS.filterChange * combo.length);

      console.log(`${comboName}: ${result.totalTime}ms, ${result.chartCount} charts`);

      expect(result.success, `Combination failed: ${result.errors.join(', ')}`).toBe(true);
      expect(result.chartCount).toBeGreaterThan(0);

      const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
      expect(realErrors).toHaveLength(0);
    });
  }
});

// ============================================================================
// RAPID FILTER TYPE STRESS - One filter type rapid fire
// ============================================================================

test.describe('Rapid Single Filter Stress', () => {
  for (const filterType of ALL_FILTER_TYPES) {
    test(`rapid ${filterType} changes (3 cycles)`, async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page);

      await page.goto('/market-overview');
      await waitForChartsLoaded(page);

      const result = await rapidFilterTest(page, filterType, 3);

      console.log(
        `Rapid ${filterType}: ${result.totalClicks} clicks, final reaction: ${result.finalReactionTime}ms`
      );

      expect(result.errors).toHaveLength(0);

      // Charts should still be visible
      const chartCount = await countVisibleCharts(page);
      expect(chartCount).toBeGreaterThan(0);

      const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
      expect(realErrors).toHaveLength(0);
    });
  }
});

// ============================================================================
// ALL FILTERS RAPID FIRE - Mix all filter types
// ============================================================================

test.describe('All Filters Rapid Fire', () => {
  test('rapid mix of all filter types (50+ clicks)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    let totalClicks = 0;
    const startTime = Date.now();

    // Cycle through all filter types rapidly
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const filterType of ALL_FILTER_TYPES) {
        const filter = FILTERS[filterType];
        for (const option of filter.options) {
          const btn = page.locator(option.selector).first();
          if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
            await btn.click();
            totalClicks++;
            await page.waitForTimeout(30); // Very rapid
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;

    // Wait for final state
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    console.log(`Total clicks: ${totalClicks} in ${totalTime}ms`);

    // Verify no errors
    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('alternating filter types (segment-bedroom-date cycle)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const sequence = [
      { filterType: 'segment', index: 0 }, // CCR
      { filterType: 'bedroom', index: 0 }, // 1BR
      { filterType: 'dateRange', index: 0 }, // 3M
      { filterType: 'segment', index: 1 }, // RCR
      { filterType: 'bedroom', index: 1 }, // 2BR
      { filterType: 'dateRange', index: 1 }, // 6M
      { filterType: 'segment', index: 2 }, // OCR
      { filterType: 'bedroom', index: 2 }, // 3BR
      { filterType: 'dateRange', index: 2 }, // 1Y
      { filterType: 'timeGranularity', index: 0 }, // Year
      { filterType: 'timeGranularity', index: 1 }, // Qtr
      { filterType: 'timeGranularity', index: 2 }, // Month
    ];

    let clickCount = 0;

    // Run sequence 3 times
    for (let i = 0; i < 3; i++) {
      for (const step of sequence) {
        const filter = FILTERS[step.filterType];
        const option = filter.options[step.index];
        const btn = page.locator(option.selector).first();

        if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
          await btn.click();
          clickCount++;
          await page.waitForTimeout(50);
        }
      }
    }

    // Final state
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    console.log(`Alternating sequence: ${clickCount} clicks`);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// COMBINATIONS ACROSS ALL PAGES
// ============================================================================

test.describe('Filter Combinations Across Pages', () => {
  const testCombination = [
    { filterType: 'segment', optionLabel: 'CCR' },
    { filterType: 'bedroom', optionLabel: '2BR' },
    { filterType: 'dateRange', optionLabel: '1Y' },
  ];

  for (const pageConfig of PAGES) {
    test(`${pageConfig.name} - CCR + 2BR + 1Y`, async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page);

      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);

      const result = await testFilterCombination(page, testCombination);

      console.log(`${pageConfig.name}: ${result.totalTime}ms, ${result.chartCount} charts`);

      expect(result.success, `${pageConfig.name} failed: ${result.errors.join(', ')}`).toBe(true);
      expect(result.chartCount).toBeGreaterThan(0);

      const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
      expect(realErrors).toHaveLength(0);
    });
  }
});

// ============================================================================
// EXTREME STRESS - Maximum filter combinations
// ============================================================================

test.describe('Extreme Filter Stress', () => {
  test('all segment options + all bedroom options rapid', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    // Click all segments
    for (const opt of FILTERS.segment.options) {
      const btn = page.locator(opt.selector).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(30);
      }
    }

    // Click all bedrooms
    for (const opt of FILTERS.bedroom.options) {
      const btn = page.locator(opt.selector).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(30);
      }
    }

    // Click all date ranges
    for (const opt of FILTERS.dateRange.options) {
      const btn = page.locator(opt.selector).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(30);
      }
    }

    // Final state
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('60-second sustained filter chaos', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    const startTime = Date.now();
    const duration = 60000; // 60 seconds
    let clickCount = 0;

    while (Date.now() - startTime < duration) {
      // Random filter type
      const filterType = ALL_FILTER_TYPES[Math.floor(Math.random() * ALL_FILTER_TYPES.length)];
      const filter = FILTERS[filterType];

      // Random option within that filter
      const option = filter.options[Math.floor(Math.random() * filter.options.length)];

      const btn = page.locator(option.selector).first();
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        await btn.click();
        clickCount++;
      }

      await page.waitForTimeout(100);
    }

    // Final verification
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    console.log(`60-second chaos: ${clickCount} clicks`);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// CROSS-PAGE COMBINATION STRESS
// ============================================================================

test.describe('Cross-Page Filter Combination Stress', () => {
  test('apply combination, navigate, verify no residual errors', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);
    const perfMetrics = new PerfMetrics();

    const combination = [
      { filterType: 'segment', optionLabel: 'RCR' },
      { filterType: 'bedroom', optionLabel: '3BR' },
      { filterType: 'dateRange', optionLabel: '3Y' },
    ];

    for (const pageConfig of PAGES) {
      // Navigate
      const navStart = Date.now();
      await page.goto(pageConfig.route);
      await waitForChartsLoaded(page);
      perfMetrics.recordNavigation('Previous', pageConfig.name, Date.now() - navStart);

      // Apply combination
      const comboStart = Date.now();
      const result = await testFilterCombination(page, combination);
      perfMetrics.record(`${pageConfig.name} combo`, Date.now() - comboStart, BUDGETS.filterChange * 3);

      expect(result.success, `${pageConfig.name} combo failed`).toBe(true);

      console.log(`${pageConfig.name}: nav + combo = ${result.totalTime}ms`);
    }

    perfMetrics.print();

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });

  test('different combinations per page', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    const pageCombinations = [
      { route: '/market-overview', combo: [{ filterType: 'segment', optionLabel: 'CCR' }] },
      {
        route: '/district-overview',
        combo: [
          { filterType: 'segment', optionLabel: 'RCR' },
          { filterType: 'bedroom', optionLabel: '2BR' },
        ],
      },
      {
        route: '/new-launch-market',
        combo: [
          { filterType: 'dateRange', optionLabel: '1Y' },
          { filterType: 'timeGranularity', optionLabel: 'Month' },
        ],
      },
      {
        route: '/supply-inventory',
        combo: [
          { filterType: 'segment', optionLabel: 'OCR' },
          { filterType: 'bedroom', optionLabel: '4BR' },
        ],
      },
      {
        route: '/explore',
        combo: [
          { filterType: 'dateRange', optionLabel: '5Y' },
          { filterType: 'segment', optionLabel: 'CCR' },
        ],
      },
      {
        route: '/value-check',
        combo: [
          { filterType: 'bedroom', optionLabel: '1BR' },
          { filterType: 'timeGranularity', optionLabel: 'Year' },
        ],
      },
      {
        route: '/exit-risk',
        combo: [
          { filterType: 'segment', optionLabel: 'RCR' },
          { filterType: 'dateRange', optionLabel: '3M' },
        ],
      },
    ];

    for (const { route, combo } of pageCombinations) {
      await page.goto(route);
      await waitForChartsLoaded(page);

      const result = await testFilterCombination(page, combo);

      const comboName = combo.map((c) => `${c.filterType}:${c.optionLabel}`).join('+');
      console.log(`${route} - ${comboName}: ${result.totalTime}ms`);

      expect(result.success, `${route} failed`).toBe(true);
    }

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});

// ============================================================================
// RESET + APPLY COMBINATIONS
// ============================================================================

test.describe('Filter Reset + Apply Cycles', () => {
  test('apply filters, reset, apply different filters (5 cycles)', async ({ page }) => {
    const consoleErrors = setupConsoleErrorCapture(page);

    await page.goto('/market-overview');
    await waitForChartsLoaded(page);

    for (let cycle = 0; cycle < 5; cycle++) {
      // Apply some filters
      const ccrBtn = page.locator(FILTERS.segment.options[0].selector).first();
      if (await ccrBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await ccrBtn.click();
        await page.waitForTimeout(100);
      }

      const br2Btn = page.locator(FILTERS.bedroom.options[1].selector).first();
      if (await br2Btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await br2Btn.click();
        await page.waitForTimeout(100);
      }

      // Look for reset button
      const resetBtn = page.locator('button:has-text("Reset"), text="Reset"').first();
      if (await resetBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await resetBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(200);
      }

      // Apply different filters
      const ocrBtn = page.locator(FILTERS.segment.options[2].selector).first();
      if (await ocrBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await ocrBtn.click();
        await page.waitForTimeout(100);
      }
    }

    // Final verification
    await page.waitForLoadState('networkidle');
    await waitForChartsLoaded(page);

    const errors = await checkForErrors(page);
    expect(errors).toHaveLength(0);

    const chartCount = await countVisibleCharts(page);
    expect(chartCount).toBeGreaterThan(0);

    const realErrors = consoleErrors.filter((e) => !e.includes('abort') && !e.includes('cancel'));
    expect(realErrors).toHaveLength(0);
  });
});
