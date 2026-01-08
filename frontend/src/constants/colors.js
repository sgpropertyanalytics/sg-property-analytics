/**
 * INSTITUTIONAL PRINT COLOR SYSTEM
 * Single Source of Truth for all color tokens
 *
 * Design Philosophy: "Financial Print / Blueprint Strategy"
 * Charts look like high-end architectural blueprints or printed financial reports.
 * The Suit: Slate + Void + Cool Gray | The Tie: Bloomberg Orange
 *
 * USAGE:
 * - Import specific palettes: import { INK, REGION, SIGNAL } from '../constants/colors'
 * - Use Tailwind classes: bg-ink, text-region-ccr, border-signal-accent
 */

// =============================================================================
// VOID (Dark Frame - Navigation & Premium Surfaces)
// =============================================================================

export const VOID = {
  base: 'var(--color-void)',      // The void - nav background (denser than dark)
  surface: 'var(--color-void-surface)',   // Elevated cards on void
  edge: 'var(--color-void-edge)',      // Machined metal borders on dark
};

// =============================================================================
// CANVAS (Light Content Areas)
// =============================================================================

export const CANVAS = {
  base: 'var(--color-canvas)',      // Main content background
  paper: 'var(--color-canvas-paper)',     // Cards, modals
  grid: 'var(--color-canvas-grid)',      // Chart grids, subtle borders (replaces sand)
};

// =============================================================================
// INK (Data/Text - The "Print")
// =============================================================================

export const INK = {
  primary: 'var(--color-ink)',   // Slate 900 - Primary data, headers, chart bars
  dense: 'var(--color-ink-dense)',     // Slate 800 - Secondary emphasis
  mid: 'var(--color-ink-mid)',       // Slate 600 - Body text
  muted: 'var(--color-ink-muted)',     // Slate 400 - Ghost data, historical, placeholders
  light: 'var(--color-ink-light)',     // Slate 300 - Subtle borders
};

// =============================================================================
// REGION (Monochrome Hierarchy - Dark→Light for CCR→OCR)
// =============================================================================

export const REGION = {
  CCR: 'var(--color-region-ccr)',       // Slate 900 - Premium/Core (darkest)
  RCR: 'var(--color-region-rcr)',       // Slate 700 - Mid-tier
  OCR: 'var(--color-region-ocr)',       // Slate 500 - Suburban (lightest)
};

// =============================================================================
// SIGNAL (Accent - "The Tie")
// =============================================================================

export const SIGNAL = {
  accent: 'var(--color-signal-accent)',    // Orange 500 - Buttons, large graphics, highlights
  accentA11y: 'var(--color-signal-a11y)', // Orange 600 - Text/borders on light (accessible)
  focus: 'var(--color-signal-focus)',     // Blue 600 - Focus rings, interactive states
};

// =============================================================================
// DELTA (Financial +/-)
// =============================================================================

export const DELTA = {
  positive: 'var(--color-delta-positive)',  // Emerald 600 - Gains, positive change
  negative: 'var(--color-delta-negative)',  // Red 600 - Losses, negative change
  neutral: 'var(--color-delta-neutral)',   // Slate 500 - No change
};

// =============================================================================
// SUPPLY (Full Slate - Inventory/Pipeline)
// =============================================================================

export const SUPPLY = {
  unsold: 'var(--color-supply-unsold)',    // Slate 900 - Heaviest (most urgent)
  upcoming: 'var(--color-supply-upcoming)',  // Slate 700 - Pipeline
  gls: 'var(--color-supply-gls)',       // Slate 500 - GLS sites
  total: 'var(--color-supply-total)',     // Slate 400 - Totals (lightest)
};

// =============================================================================
// LIQUIDITY (Exit Risk / Turnover Zones)
// =============================================================================

export const LIQUIDITY = {
  low: 'var(--color-liquidity-low)',       // Amber 500 - Low Liquidity (<5 per 100 units)
  healthy: 'var(--color-liquidity-healthy)',   // Emerald 600 - Healthy Liquidity (5-15 per 100 units)
  high: 'var(--color-liquidity-high)',      // Red 600 - Elevated Turnover (>15 per 100 units)
  unknown: 'var(--color-liquidity-unknown)',   // Slate 400 - Unknown
};

// =============================================================================
// STATUS (Operational States)
// =============================================================================

export const STATUS = {
  live: 'var(--color-status-live)',      // Emerald 600 - Live/active indicators
  positive: 'var(--color-status-live)',  // Alias
  negative: 'var(--color-status-negative)',  // Red 600 - Errors, alerts
};

// =============================================================================
// CHART (Unified Chart Palette)
// =============================================================================

export const CHART = {
  // Primary data series (use INK for monochrome charts)
  primary: 'var(--color-chart-1)',
  secondary: 'var(--color-chart-3)',
  tertiary: 'var(--color-chart-4)',

  // Signal color for emphasis
  accent: SIGNAL.accent,

  // Grid and axes
  grid: 'rgb(var(--color-chart-1-rgb) / 0.05)',   // Slate 900 at 5%
  axis: 'rgb(var(--color-chart-1-rgb) / 0.3)',    // Slate 900 at 30%

  // Region colors (for geographic data)
  regionCCR: REGION.CCR,
  regionRCR: REGION.RCR,
  regionOCR: REGION.OCR,
};

// =============================================================================
// REGION BADGE CLASSES (Tailwind)
// =============================================================================

export const REGION_BADGE_CLASSES = {
  CCR: 'bg-slate-900 text-white',
  RCR: 'bg-slate-700 text-white',
  OCR: 'bg-slate-500 text-white',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get region color by key
 * @param {'CCR' | 'RCR' | 'OCR'} region
 * @returns {string} Hex color
 */
export const getRegionColor = (region) => {
  const r = (region || '').toUpperCase();
  return REGION[r] || REGION.OCR;
};

/**
 * Get Tailwind badge classes for a region
 * @param {'CCR' | 'RCR' | 'OCR'} region
 * @returns {string} Tailwind classes
 */
export const getRegionBadgeClass = (region) => {
  const r = (region || '').toUpperCase();
  return REGION_BADGE_CLASSES[r] || REGION_BADGE_CLASSES.OCR;
};

// =============================================================================
// DEPRECATED EXPORTS REMOVED (Phase 5 Complete)
// =============================================================================
// BRAND, THEME_COLORS, and MONO exports have been removed.
// All consumers now use: INK, REGION, CANVAS, VOID, SIGNAL, DELTA, SUPPLY
