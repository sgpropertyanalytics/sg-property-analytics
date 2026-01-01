/**
 * Performance Test Fixtures
 *
 * Shared utilities, selectors, and constants for performance tests.
 * Covers all filters, pages, and chart reaction timing.
 */

// Performance budgets (from speed-agent)
export const BUDGETS = {
  pageLoad: {
    p0: 2000, // P0 pages: Market Overview, District Overview, New Launch
    p1: 3000, // P1 pages: Supply, Explore, Value Check, Exit Risk
  },
  filterChange: 600, // Max time for filter → chart update
  chartRender: 800, // Max time for single chart to render
  navigationTime: 2000, // Max time for page-to-page navigation
};

// All dashboard pages to test
export const PAGES = [
  {
    name: 'Market Overview',
    route: '/market-overview',
    priority: 'P0',
    hasFilters: true,
    charts: ['time-trend-chart', 'price-distribution-chart', 'kpi-cards'],
  },
  {
    name: 'District Overview',
    route: '/district-overview',
    priority: 'P0',
    hasFilters: true,
    charts: ['district-comparison-chart', 'market-strategy-map'],
  },
  {
    name: 'New Launch Market',
    route: '/new-launch-market',
    priority: 'P0',
    hasFilters: true,
    charts: ['new-vs-resale-chart', 'new-launch-timeline'],
  },
  {
    name: 'Supply & Inventory',
    route: '/supply-inventory',
    priority: 'P1',
    hasFilters: true,
    charts: ['supply-waterfall', 'supply-breakdown-table'],
  },
  {
    name: 'Explore',
    route: '/explore',
    priority: 'P1',
    hasFilters: true,
    charts: ['beads-chart', 'floor-liquidity-heatmap'],
  },
  {
    name: 'Value Check',
    route: '/value-check',
    priority: 'P1',
    hasFilters: true,
    charts: ['value-parity-panel', 'deal-checker-map'],
  },
  {
    name: 'Exit Risk',
    route: '/exit-risk',
    priority: 'P1',
    hasFilters: true,
    charts: ['exit-risk-dashboard'],
  },
];

// ============================================================================
// FILTER DEFINITIONS - All UI filters with button labels/selectors
// ============================================================================

export const FILTERS = {
  // Time Granularity Toggle
  timeGranularity: {
    name: 'Time Granularity',
    type: 'toggle',
    options: [
      { label: 'Year', selector: 'button:has-text("Year")' },
      { label: 'Qtr', selector: 'button:has-text("Qtr")' },
      { label: 'Month', selector: 'button:has-text("Month")' },
    ],
  },

  // Market Segment (Region) Filter
  segment: {
    name: 'Market Segment',
    type: 'toggle',
    options: [
      { label: 'CCR', selector: 'button:has-text("CCR")' },
      { label: 'RCR', selector: 'button:has-text("RCR")' },
      { label: 'OCR', selector: 'button:has-text("OCR")' },
    ],
  },

  // Bedroom Type Filter
  bedroom: {
    name: 'Bedroom Type',
    type: 'toggle',
    options: [
      { label: '1BR', selector: 'button:has-text("1BR")' },
      { label: '2BR', selector: 'button:has-text("2BR")' },
      { label: '3BR', selector: 'button:has-text("3BR")' },
      { label: '4BR', selector: 'button:has-text("4BR")' },
      { label: '5BR', selector: 'button:has-text("5BR")' },
    ],
  },

  // Date Range Presets
  dateRange: {
    name: 'Date Range',
    type: 'toggle',
    options: [
      { label: '3M', selector: 'button:has-text("3M")' },
      { label: '6M', selector: 'button:has-text("6M")' },
      { label: '1Y', selector: 'button:has-text("1Y")' },
      { label: '3Y', selector: 'button:has-text("3Y")' },
      { label: '5Y', selector: 'button:has-text("5Y")' },
      { label: 'All', selector: 'button:has-text("All")' },
    ],
  },

  // District dropdown (special handling)
  district: {
    name: 'District',
    type: 'dropdown',
    triggerSelector: '[data-testid="district-dropdown"], button:has-text("District"), button:has-text("All Districts")',
    // Sample districts to test
    sampleOptions: ['D01', 'D09', 'D10', 'D15', 'D19'],
  },
};

// All filter types for iteration
export const ALL_FILTER_TYPES = ['timeGranularity', 'segment', 'bedroom', 'dateRange'];

// Chart selectors - fallbacks for charts without data-testid
export const CHART_SELECTORS = {
  // Primary: data-testid
  primary: '[data-testid*="chart"], [data-testid*="Chart"]',
  // Fallback: canvas elements (Chart.js)
  canvas: 'canvas',
  // Fallback: chart containers
  container: '.chart-container, [class*="Chart"]',
  // Loading indicators
  loading: '.animate-pulse, [class*="loading"], [class*="skeleton"]',
  // Error states
  error: '[class*="error"], [class*="Error"]',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Wait for all charts on page to finish loading
 * @returns {number} Load time in milliseconds
 */
export async function waitForChartsLoaded(page, timeout = 10000) {
  const startTime = Date.now();

  // Wait for network to settle
  await page.waitForLoadState('networkidle', { timeout });

  // Wait for loading indicators to disappear
  try {
    await page.waitForSelector(CHART_SELECTORS.loading, {
      state: 'hidden',
      timeout: timeout - (Date.now() - startTime),
    });
  } catch {
    // No loading indicators, or they're already gone
  }

  // Wait a bit for React to finish rendering
  await page.waitForTimeout(100);

  return Date.now() - startTime;
}

/**
 * Count visible charts on the page
 */
export async function countVisibleCharts(page) {
  const canvases = await page.locator('canvas').count();
  const chartContainers = await page.locator(CHART_SELECTORS.container).count();
  return Math.max(canvases, chartContainers);
}

/**
 * Check for any error states on the page
 */
export async function checkForErrors(page) {
  const errors = [];

  // Check for error boundary
  const errorBoundary = page.locator('.error-boundary, [class*="ErrorBoundary"]');
  if ((await errorBoundary.count()) > 0) {
    errors.push('Error boundary triggered');
  }

  // Check for error messages in text
  const errorText = page.locator('text=/failed to load|error loading|something went wrong/i');
  if ((await errorText.count()) > 0) {
    errors.push('Error message visible');
  }

  // Check for stuck loading states (loading for too long)
  const loadingIndicators = await page.locator(CHART_SELECTORS.loading).count();
  if (loadingIndicators > 0) {
    errors.push(`${loadingIndicators} charts still loading`);
  }

  return errors;
}

/**
 * Collect console errors during test
 */
export function setupConsoleErrorCapture(page) {
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known benign errors
      if (
        !text.includes('ResizeObserver') &&
        !text.includes('aborted') &&
        !text.includes('CanceledError') &&
        !text.includes('net::ERR')
      ) {
        errors.push(text);
      }
    }
  });

  return errors;
}

/**
 * Click a filter button and measure chart reaction time
 * @returns {Object} { success: boolean, reactionTime: number, errors: string[] }
 */
export async function clickFilterAndMeasure(page, selector, filterName = 'filter') {
  const result = {
    success: false,
    reactionTime: 0,
    filterName,
    errors: [],
  };

  const button = page.locator(selector).first();

  if (!(await button.isVisible({ timeout: 2000 }).catch(() => false))) {
    result.errors.push(`${filterName} button not visible`);
    return result;
  }

  const startTime = Date.now();

  try {
    // Click the filter
    await button.click();

    // Wait for charts to update
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Wait for any loading indicators to clear
    try {
      await page.waitForSelector(CHART_SELECTORS.loading, {
        state: 'hidden',
        timeout: 3000,
      });
    } catch {
      // Loading indicators already gone
    }

    result.reactionTime = Date.now() - startTime;
    result.success = true;

    // Check for errors after filter change
    result.errors = await checkForErrors(page);
  } catch (error) {
    result.reactionTime = Date.now() - startTime;
    result.errors.push(error.message);
  }

  return result;
}

/**
 * Test all options within a single filter type
 * @returns {Object[]} Array of filter test results
 */
export async function testFilterOptions(page, filterType) {
  const filter = FILTERS[filterType];
  if (!filter || filter.type !== 'toggle') {
    return [];
  }

  const results = [];

  for (const option of filter.options) {
    const result = await clickFilterAndMeasure(page, option.selector, `${filter.name}: ${option.label}`);
    results.push(result);

    // Small delay between filter clicks
    await page.waitForTimeout(200);
  }

  return results;
}

/**
 * Rapid-fire test a filter (click through all options quickly)
 * @returns {Object} { totalClicks, errors, finalReactionTime }
 */
export async function rapidFilterTest(page, filterType, iterations = 3) {
  const filter = FILTERS[filterType];
  if (!filter || filter.type !== 'toggle') {
    return { totalClicks: 0, errors: [], finalReactionTime: 0 };
  }

  const errors = [];
  let totalClicks = 0;

  for (let i = 0; i < iterations; i++) {
    for (const option of filter.options) {
      const button = page.locator(option.selector).first();
      if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
        await button.click();
        totalClicks++;
        await page.waitForTimeout(50); // Rapid clicks
      }
    }
  }

  // Wait for final state to settle
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const finalStartTime = Date.now();
  await waitForChartsLoaded(page);
  const finalReactionTime = Date.now() - finalStartTime;

  const pageErrors = await checkForErrors(page);
  errors.push(...pageErrors);

  return { totalClicks, errors, finalReactionTime };
}

/**
 * Test filter combinations (multi-select scenario)
 * @returns {Object} Test result with timing and errors
 */
export async function testFilterCombination(page, combination) {
  const results = [];
  const startTime = Date.now();

  for (const { filterType, optionLabel } of combination) {
    const filter = FILTERS[filterType];
    if (!filter) continue;

    const option = filter.options?.find((o) => o.label === optionLabel);
    if (!option) continue;

    const button = page.locator(option.selector).first();
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click();
      await page.waitForTimeout(100);
    }
  }

  // Wait for all updates to complete
  await page.waitForLoadState('networkidle');
  const totalTime = Date.now() - startTime;
  await waitForChartsLoaded(page);

  const errors = await checkForErrors(page);
  const chartCount = await countVisibleCharts(page);

  return {
    combination,
    totalTime,
    errors,
    chartCount,
    success: errors.length === 0 && chartCount > 0,
  };
}

/**
 * Navigate to page and verify it loads correctly
 */
export async function navigateAndVerify(page, route, pageName) {
  const startTime = Date.now();

  await page.goto(route);
  await waitForChartsLoaded(page);

  const navigationTime = Date.now() - startTime;
  const chartCount = await countVisibleCharts(page);
  const errors = await checkForErrors(page);

  return {
    pageName,
    route,
    navigationTime,
    chartCount,
    errors,
    success: errors.length === 0 && chartCount > 0,
  };
}

/**
 * Performance metrics collector
 */
export class PerfMetrics {
  constructor() {
    this.metrics = [];
  }

  record(name, value, budget, unit = 'ms') {
    const status = value <= budget ? 'PASS' : 'FAIL';
    this.metrics.push({ name, value, budget, unit, status });
  }

  recordFilterTest(filterName, reactionTime, success) {
    const budget = BUDGETS.filterChange;
    const status = success && reactionTime <= budget ? 'PASS' : 'FAIL';
    this.metrics.push({
      name: `Filter: ${filterName}`,
      value: reactionTime,
      budget,
      unit: 'ms',
      status,
    });
  }

  recordNavigation(fromPage, toPage, time) {
    const budget = BUDGETS.navigationTime;
    const status = time <= budget ? 'PASS' : 'FAIL';
    this.metrics.push({
      name: `Nav: ${fromPage} → ${toPage}`,
      value: time,
      budget,
      unit: 'ms',
      status,
    });
  }

  getSummary() {
    const passed = this.metrics.filter((m) => m.status === 'PASS').length;
    const failed = this.metrics.filter((m) => m.status === 'FAIL').length;

    // Calculate averages by category
    const filterMetrics = this.metrics.filter((m) => m.name.startsWith('Filter:'));
    const navMetrics = this.metrics.filter((m) => m.name.startsWith('Nav:'));

    const avgFilter =
      filterMetrics.length > 0
        ? Math.round(filterMetrics.reduce((a, b) => a + b.value, 0) / filterMetrics.length)
        : 0;

    const avgNav =
      navMetrics.length > 0
        ? Math.round(navMetrics.reduce((a, b) => a + b.value, 0) / navMetrics.length)
        : 0;

    return {
      total: this.metrics.length,
      passed,
      failed,
      avgFilterTime: avgFilter,
      avgNavigationTime: avgNav,
      metrics: this.metrics,
    };
  }

  print() {
    console.log('\n=== Performance Metrics ===');
    console.table(this.metrics);
    const summary = this.getSummary();
    console.log(`\nTotal: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
    console.log(`Avg Filter Time: ${summary.avgFilterTime}ms | Avg Navigation: ${summary.avgNavigationTime}ms`);
  }

  getFailures() {
    return this.metrics.filter((m) => m.status === 'FAIL');
  }
}

/**
 * Filter combination generator for comprehensive testing
 */
export function generateFilterCombinations() {
  return [
    // Single filters
    [{ filterType: 'segment', optionLabel: 'CCR' }],
    [{ filterType: 'segment', optionLabel: 'RCR' }],
    [{ filterType: 'segment', optionLabel: 'OCR' }],
    [{ filterType: 'bedroom', optionLabel: '1BR' }],
    [{ filterType: 'bedroom', optionLabel: '3BR' }],
    [{ filterType: 'dateRange', optionLabel: '1Y' }],
    [{ filterType: 'dateRange', optionLabel: '3M' }],
    [{ filterType: 'timeGranularity', optionLabel: 'Month' }],

    // Two-filter combinations
    [
      { filterType: 'segment', optionLabel: 'CCR' },
      { filterType: 'bedroom', optionLabel: '2BR' },
    ],
    [
      { filterType: 'segment', optionLabel: 'RCR' },
      { filterType: 'dateRange', optionLabel: '1Y' },
    ],
    [
      { filterType: 'bedroom', optionLabel: '3BR' },
      { filterType: 'timeGranularity', optionLabel: 'Month' },
    ],

    // Three-filter combinations
    [
      { filterType: 'segment', optionLabel: 'CCR' },
      { filterType: 'bedroom', optionLabel: '2BR' },
      { filterType: 'dateRange', optionLabel: '1Y' },
    ],
    [
      { filterType: 'segment', optionLabel: 'OCR' },
      { filterType: 'bedroom', optionLabel: '4BR' },
      { filterType: 'timeGranularity', optionLabel: 'Year' },
    ],

    // Full combination
    [
      { filterType: 'segment', optionLabel: 'RCR' },
      { filterType: 'bedroom', optionLabel: '3BR' },
      { filterType: 'dateRange', optionLabel: '3Y' },
      { filterType: 'timeGranularity', optionLabel: 'Qtr' },
    ],
  ];
}
