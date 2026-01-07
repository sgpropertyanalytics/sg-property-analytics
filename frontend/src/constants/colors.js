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
  base: '#0A0A0A',      // The void - nav background (denser than dark)
  surface: '#1A1A1A',   // Elevated cards on void
  edge: '#333333',      // Machined metal borders on dark
};

// =============================================================================
// CANVAS (Light Content Areas)
// =============================================================================

export const CANVAS = {
  base: '#FAFAFA',      // Main content background
  paper: '#FFFFFF',     // Cards, modals
  grid: '#E5E7EB',      // Chart grids, subtle borders (replaces sand)
};

// =============================================================================
// INK (Data/Text - The "Print")
// =============================================================================

export const INK = {
  primary: '#0F172A',   // Slate 900 - Primary data, headers, chart bars
  dense: '#1E293B',     // Slate 800 - Secondary emphasis
  mid: '#475569',       // Slate 600 - Body text
  muted: '#94A3B8',     // Slate 400 - Ghost data, historical, placeholders
  light: '#CBD5E1',     // Slate 300 - Subtle borders
};

// =============================================================================
// REGION (Monochrome Hierarchy - Dark→Light for CCR→OCR)
// =============================================================================

export const REGION = {
  CCR: '#0F172A',       // Slate 900 - Premium/Core (darkest)
  RCR: '#334155',       // Slate 700 - Mid-tier
  OCR: '#64748B',       // Slate 500 - Suburban (lightest)
};

// =============================================================================
// SIGNAL (Accent - "The Tie")
// =============================================================================

export const SIGNAL = {
  accent: '#F97316',    // Orange 500 - Buttons, large graphics, highlights
  accentA11y: '#EA580C', // Orange 600 - Text/borders on light (accessible)
  focus: '#2563EB',     // Blue 600 - Focus rings, interactive states
};

// =============================================================================
// DELTA (Financial +/-)
// =============================================================================

export const DELTA = {
  positive: '#059669',  // Emerald 600 - Gains, positive change
  negative: '#DC2626',  // Red 600 - Losses, negative change
  neutral: '#64748B',   // Slate 500 - No change
};

// =============================================================================
// SUPPLY (Full Slate - Inventory/Pipeline)
// =============================================================================

export const SUPPLY = {
  unsold: '#0F172A',    // Slate 900 - Heaviest (most urgent)
  upcoming: '#334155',  // Slate 700 - Pipeline
  gls: '#64748B',       // Slate 500 - GLS sites
  total: '#94A3B8',     // Slate 400 - Totals (lightest)
};

// =============================================================================
// LIQUIDITY (Exit Risk / Turnover Zones)
// =============================================================================

export const LIQUIDITY = {
  low: '#F59E0B',       // Amber 500 - Low Liquidity (<5 per 100 units)
  healthy: '#059669',   // Emerald 600 - Healthy Liquidity (5-15 per 100 units)
  high: '#DC2626',      // Red 600 - Elevated Turnover (>15 per 100 units)
  unknown: '#94A3B8',   // Slate 400 - Unknown
};

// =============================================================================
// STATUS (Operational States)
// =============================================================================

export const STATUS = {
  live: '#059669',      // Emerald 600 - Live/active indicators
  positive: '#059669',  // Alias
  negative: '#DC2626',  // Red 600 - Errors, alerts
};

// =============================================================================
// CHART (Unified Chart Palette)
// =============================================================================

export const CHART = {
  // Primary data series (use INK for monochrome charts)
  primary: INK.primary,
  secondary: INK.muted,
  tertiary: INK.light,

  // Signal color for emphasis
  accent: SIGNAL.accent,

  // Grid and axes
  grid: 'rgba(15, 23, 42, 0.05)',   // Slate 900 at 5%
  axis: 'rgba(15, 23, 42, 0.3)',    // Slate 900 at 30%

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
