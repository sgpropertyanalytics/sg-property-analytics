/**
 * Base Chart.js options - MUST be spread into all chart options
 *
 * CHART LAYOUT CONTRACT - NO EXCEPTIONS
 *
 * These settings ensure Chart.js fills its container properly:
 * - responsive: true - chart resizes with container
 * - maintainAspectRatio: false - chart fills height (doesn't use default 2:1 ratio)
 *
 * MANDATORY: All Chart.js charts must extend this config.
 * - Do NOT override maintainAspectRatio
 * - Do NOT size charts via width/height props
 *
 * Usage:
 * const options = {
 *   ...BASE_CHART_OPTIONS,
 *   plugins: { ... },
 *   scales: { ... },
 * };
 */
export const BASE_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
};

// Backwards compatibility alias
export const baseChartJsOptions = BASE_CHART_OPTIONS;

export default BASE_CHART_OPTIONS;
