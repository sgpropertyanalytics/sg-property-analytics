/**
 * Chart Layout - Single Source of Truth
 *
 * Consolidates all chart sizing/spacing concerns:
 * - React container sizing (height presets) → used by pages via useChartHeight
 * - Chart.js internal padding → used by chartOptions.js
 *
 * WHY SEPARATE:
 * - Height = React container level (CSS/style)
 * - Padding = Chart.js library level (canvas internals)
 * Chart.js cannot control container height, so we keep them as separate
 * exports but in ONE file for discoverability.
 */

// =============================================================================
// HEIGHT PRESETS (used by pages/components with useChartHeight)
// =============================================================================

export const CHART_HEIGHT = {
  // Standard height for dashboard charts (line, bar, scatter)
  standard: 380,

  // Tables and data grids (more rows visible)
  table: 400,

  // Compact charts (sparklines, mini indicators)
  compact: 280,
};

// =============================================================================
// MOBILE CAPS (max height on mobile to prevent viewport domination)
// =============================================================================

export const CHART_MOBILE_CAP = {
  standard: 320,
};

// =============================================================================
// CHART.JS INTERNAL PADDING (does NOT control container height)
// =============================================================================

export const CHART_PADDING = {
  top: 8,
  right: 16,
  bottom: 8,
  left: 8,
};

// =============================================================================
// CONVENIENCE EXPORT (optional - for single import)
// =============================================================================

export const CHART_LAYOUT = {
  height: CHART_HEIGHT,
  mobileCap: CHART_MOBILE_CAP,
  padding: CHART_PADDING,
};

export default CHART_LAYOUT;
