/**
 * Performance Logger Utilities
 *
 * DEV-ONLY: Console logging for chart performance debugging.
 * Used in conjunction with ChartTimingContext for detailed timing analysis.
 */

import { PERFORMANCE_BUDGETS, getBudgetStatus } from '../constants/performanceBudgets';

const isDev = import.meta.env.DEV;

/**
 * Log a timing entry to console with budget comparison
 */
export function logChartTiming(entry) {
  if (!isDev) return;

  const {
    chartName,
    timeToData,
    apiLatency,
    transformDuration,
    renderDuration,
    totalDuration,
    exceedsBudget: exceeded,
    backendElapsedMs,
    isFilterChange,
  } = entry;

  const budget = isFilterChange ? PERFORMANCE_BUDGETS.filterUpdate.p95 : PERFORMANCE_BUDGETS.timeToData.p95;
  const icon = exceeded ? '\u{1F534}' : '\u{2705}';
  const budgetLabel = exceeded ? ' (OVER BUDGET)' : '';

  console.groupCollapsed(`${icon} [${chartName}] TTD: ${timeToData}ms${budgetLabel}`);
  console.table({
    'Time to Data': `${timeToData ?? '-'}ms`,
    'API Latency (FE)': `${apiLatency ?? '-'}ms`,
    'Backend Elapsed': `${backendElapsedMs ?? '-'}ms`,
    Transform: `${transformDuration ?? '-'}ms`,
    Render: `${renderDuration ?? '-'}ms`,
    Total: `${totalDuration ?? '-'}ms`,
    Budget: `${budget}ms`,
    Exceeded: exceeded,
    'Filter Change': isFilterChange,
  });
  console.groupEnd();
}

/**
 * Log a summary of all chart timings
 */
export function logTimingSummary(summary) {
  if (!isDev) return;

  const { chartCount, avgTimeToData, p95TimeToData, budgetViolations } = summary;

  console.group('\u{1F4CA} Chart Timing Summary');
  console.table({
    'Total Charts': chartCount,
    'Avg TTD': `${avgTimeToData}ms`,
    'P95 TTD': `${p95TimeToData}ms`,
    'Budget Violations': budgetViolations.length,
  });

  if (budgetViolations.length > 0) {
    console.warn('\u{26A0}\u{FE0F} Charts exceeding budget:', budgetViolations.join(', '));
  }
  console.groupEnd();
}

/**
 * Log a slow chart warning
 */
export function logSlowChart(chartName, timeToData, budget) {
  if (!isDev) return;

  console.warn(
    `\u{1F534} [SLOW CHART] ${chartName}: ${timeToData}ms (budget: ${budget}ms, exceeded by ${timeToData - budget}ms)`
  );
}

/**
 * Log timing for a specific phase
 */
export function logTimingPhase(chartName, phase, durationMs) {
  if (!isDev) return;

  const budgetMap = {
    api: 'apiLatency',
    transform: 'transformDuration',
    render: 'renderDuration',
  };

  const budgetKey = budgetMap[phase];
  const status = budgetKey ? getBudgetStatus(budgetKey, durationMs) : 'ok';
  const icon = status === 'exceeded' ? '\u{1F534}' : status === 'warning' ? '\u{1F7E1}' : '\u{2705}';

  console.log(`${icon} [${chartName}] ${phase}: ${durationMs}ms`);
}

/**
 * Create a timing helper for manual instrumentation
 *
 * Usage:
 * ```js
 * const timer = createTimer('MyChart');
 * timer.mark('fetchStart');
 * // ... do work ...
 * timer.mark('fetchEnd');
 * timer.log(); // Logs all durations
 * ```
 */
export function createTimer(label) {
  if (!isDev) {
    return {
      mark: () => {},
      log: () => {},
      getDurations: () => ({}),
    };
  }

  const marks = new Map();
  const startTime = performance.now();

  return {
    mark(name) {
      marks.set(name, performance.now());
    },

    log() {
      const durations = {};
      let prevTime = startTime;
      let prevName = 'start';

      marks.forEach((time, name) => {
        durations[`${prevName} → ${name}`] = Math.round(time - prevTime);
        prevTime = time;
        prevName = name;
      });

      durations['total'] = Math.round(performance.now() - startTime);

      console.group(`\u{23F1} [${label}] Timing`);
      console.table(durations);
      console.groupEnd();
    },

    getDurations() {
      const durations = {};
      let prevTime = startTime;
      let prevName = 'start';

      marks.forEach((time, name) => {
        durations[`${prevName}_to_${name}`] = Math.round(time - prevTime);
        prevTime = time;
        prevName = name;
      });

      durations.total = Math.round(performance.now() - startTime);
      return durations;
    },
  };
}

export default {
  logChartTiming,
  logTimingSummary,
  logSlowChart,
  logTimingPhase,
  createTimer,
};
