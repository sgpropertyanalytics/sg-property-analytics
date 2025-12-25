/**
 * Base Chart.js options - MUST be spread into all chart options
 *
 * These settings ensure Chart.js fills its container properly:
 * - responsive: true - chart resizes with container
 * - maintainAspectRatio: false - chart fills height (doesn't use default 2:1 ratio)
 *
 * Usage:
 * const options = {
 *   ...baseChartJsOptions,
 *   plugins: { ... },
 *   scales: { ... },
 * };
 */
export const baseChartJsOptions = {
  responsive: true,
  maintainAspectRatio: false,
};

export default baseChartJsOptions;
