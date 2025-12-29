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

/**
 * Bloomberg Terminal Typography for Chart Axes
 *
 * Uses IBM Plex Mono for numerical data on axes.
 * Numbers use slate-900 (#0f172a) for high contrast.
 * Axis titles use slate-500 (#64748b) for hierarchy.
 */
export const CHART_AXIS_FONT = {
  family: '"IBM Plex Mono", ui-monospace, monospace',
  weight: 500,
};

export const CHART_AXIS_DEFAULTS = {
  ticks: {
    font: CHART_AXIS_FONT,
    color: '#0f172a',  // slate-900 - darker for data
  },
  title: {
    font: { ...CHART_AXIS_FONT, size: 11 },
    color: '#64748b',  // slate-500 - lighter for labels
  },
};

export default BASE_CHART_OPTIONS;
