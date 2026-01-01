/**
 * Performance Budgets for Chart Timing
 *
 * Based on speed-agent thresholds.
 * Used by ChartTimingContext to flag budget violations.
 */

export const PERFORMANCE_BUDGETS = {
  // Time to Data (mount to state update with data)
  timeToData: {
    p95: 800, // 800ms target
    warning: 600,
  },

  // Filter change to chart update
  filterUpdate: {
    p95: 600, // 600ms target
    warning: 400,
  },

  // Individual phases
  apiLatency: {
    p95: 500,
    warning: 300,
  },

  transformDuration: {
    p95: 100,
    warning: 50,
  },

  renderDuration: {
    p95: 200,
    warning: 100,
  },
};

/**
 * Check if a timing value exceeds its budget
 */
export function exceedsBudget(metricName, value) {
  const budget = PERFORMANCE_BUDGETS[metricName];
  if (!budget || value == null) return false;
  return value > budget.p95;
}

/**
 * Check if a timing value is in warning range
 */
export function isWarning(metricName, value) {
  const budget = PERFORMANCE_BUDGETS[metricName];
  if (!budget || value == null) return false;
  return value > budget.warning && value <= budget.p95;
}

/**
 * Get status for a timing value: 'ok' | 'warning' | 'exceeded'
 */
export function getBudgetStatus(metricName, value) {
  if (exceedsBudget(metricName, value)) return 'exceeded';
  if (isWarning(metricName, value)) return 'warning';
  return 'ok';
}
