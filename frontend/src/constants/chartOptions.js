import { MONO } from './colors';

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
 * Colors use MONO palette from design system.
 */
export const CHART_AXIS_FONT = {
  family: '"IBM Plex Mono", ui-monospace, monospace',
  weight: 500,
};

export const CHART_AXIS_DEFAULTS = {
  ticks: {
    font: CHART_AXIS_FONT,
    color: MONO.ink,  // #000000 - pure black for data
  },
  title: {
    font: { ...CHART_AXIS_FONT, size: 11 },
    color: MONO.mid,  // #525252 - medium gray for labels
  },
};

export default BASE_CHART_OPTIONS;
