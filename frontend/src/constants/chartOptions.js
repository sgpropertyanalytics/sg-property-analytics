import { INK, CHART_COLORS } from './colors';
import { CHART_PADDING } from './chartLayout';

// =============================================================================
// TOOLTIP STYLING - Single source of truth for Chart.js tooltips
// =============================================================================

export const CHART_TOOLTIP_FONT = {
  family: '"IBM Plex Mono", ui-monospace, monospace',
};

export const CHART_TOOLTIP = {
  backgroundColor: CHART_COLORS.navyAlpha95,
  titleColor: CHART_COLORS.slate100,
  bodyColor: CHART_COLORS.slate300,
  borderColor: CHART_COLORS.ocean,
  borderWidth: 1,
  cornerRadius: 6,
  padding: 12,
  titleFont: {
    ...CHART_TOOLTIP_FONT,
    size: 11,
    weight: '600',
  },
  bodyFont: {
    ...CHART_TOOLTIP_FONT,
    size: 11,
  },
};

// =============================================================================
// BORDER RADIUS - Consistent rounding across charts
// =============================================================================

export const CHART_BORDER_RADIUS = {
  none: 0,
  sm: 3,
  md: 6,
  lg: 8,
};

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
 * Includes standardized tooltip styling and layout padding.
 *
 * Usage:
 * const options = {
 *   ...BASE_CHART_OPTIONS,
 *   plugins: {
 *     tooltip: {
 *       ...CHART_TOOLTIP,  // Use standard tooltip styling
 *       callbacks: { ... },  // Add custom callbacks
 *     },
 *   },
 *   scales: { ... },
 * };
 */
export const BASE_CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  // Padding from single source of truth (chartLayout.js)
  layout: {
    padding: CHART_PADDING,
  },
};

// Backwards compatibility alias
export const baseChartJsOptions = BASE_CHART_OPTIONS;

/**
 * Bloomberg Terminal Typography for Chart Axes
 *
 * Uses IBM Plex Mono for numerical data on axes.
 * Colors use INK palette from design system.
 */
export const CHART_AXIS_FONT = {
  family: '"IBM Plex Mono", ui-monospace, monospace',
  weight: 500,
};

export const CHART_AXIS_DEFAULTS = {
  ticks: {
    font: CHART_AXIS_FONT,
    color: INK.primary,  // slate-900 - primary data
  },
  title: {
    font: { ...CHART_AXIS_FONT, size: 11 },
    color: INK.mid,  // slate-600 - medium gray for labels
  },
};

export default BASE_CHART_OPTIONS;
