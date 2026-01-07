/**
 * WHITE OPS / MUNITIONS-GRADE COLOR SYSTEM
 * Single Source of Truth for all color tokens
 *
 * USAGE:
 * - Import specific palettes: import { MONO, STATUS, BRAND } from '../constants/colors'
 * - Use Tailwind classes after Phase 2: bg-mono-ink, text-status-live, border-brand-navy
 */

// =============================================================================
// MONOCHROMATIC BASE (Primary for Weapon Aesthetic)
// =============================================================================

export const MONO = {
  void: '#0A0A0A',      // The void - nav background (denser than dark)
  surface: '#1A1A1A',   // Elevated surfaces on void
  edge: '#333333',      // Machined metal borders
  ink: '#000000',       // Pure black - headers, borders, emphasis
  dark: '#171717',      // Near-black - active states (inverted BG)
  mid: '#525252',       // Medium gray - body text
  light: '#A3A3A3',     // Light gray - secondary text, placeholders
  muted: '#E5E7EB',     // Border gray - structural lines
  canvas: '#FAFAFA',
};

// =============================================================================
// STATUS COLORS (Surgical Use Only)
// =============================================================================

export const STATUS = {
  live: '#10B981',      // Emerald - ONLY for live/active indicators
  negative: '#FF5500',  // Orange - negative deltas
  positive: '#10B981',  // Alias for consistency
};

// =============================================================================
// LIQUIDITY PALETTE (Exit Risk / Turnover zones)
// =============================================================================

export const LIQUIDITY = {
  low: '#F59E0B',       // Soft amber - Low Liquidity (<5 per 100 units)
  healthy: '#10B981',   // Muted green - Healthy Liquidity (5-15 per 100 units)
  high: '#EF4444',      // Muted red - Elevated Turnover (>15 per 100 units)
  unknown: '#94B4C1',   // Sky blue - Unknown
};

// =============================================================================
// BRAND PALETTE (Legacy - Charts/Regions)
// =============================================================================

export const BRAND = {
  navy: '#213448',      // CCR, primary
  blue: '#547792',      // RCR, secondary
  sky: '#94B4C1',       // OCR, tertiary
  sand: '#EAE0CF',      // Backgrounds, accents
};

// =============================================================================
// REGION MAPPING
// =============================================================================

export const REGION = {
  CCR: BRAND.navy,
  RCR: BRAND.blue,
  OCR: BRAND.sky,
};

// =============================================================================
// SUPPLY PALETTE (For supply/inventory charts)
// =============================================================================

export const SUPPLY = {
  unsold: '#6b4226',    // Muted chocolate brown
  upcoming: '#9c6644',  // Muted terracotta
  gls: '#c4a77d',       // Muted camel/tan
  total: '#e8dcc8',     // Warm cream
};

// =============================================================================
// CHART COLORS (Terminal-style for weapon aesthetic)
// =============================================================================

export const CHART = {
  primary: BRAND.navy,
  secondary: BRAND.blue,
  tertiary: BRAND.sky,
  accent: BRAND.sand,
  // Terminal overrides (for monochrome charts)
  terminalPrimary: MONO.ink,
  terminalSecondary: MONO.mid,
  terminalAccent: STATUS.live,
  grid: 'rgba(0, 0, 0, 0.05)',
  axis: 'rgba(0, 0, 0, 0.3)',
};

// =============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// =============================================================================

/**
 * @deprecated Use BRAND instead for clarity
 * Kept for backward compatibility with existing components
 */
export const THEME_COLORS = BRAND;

/**
 * Region badge Tailwind classes (using hardcoded hex for Tailwind JIT)
 * These use raw hex because Tailwind needs static analysis
 */
export const REGION_BADGE_CLASSES = {
  CCR: 'bg-[#213448] text-white',
  RCR: 'bg-[#547792] text-white',
  OCR: 'bg-[#94B4C1] text-[#213448]',
  SAND: 'bg-[#EAE0CF] text-[#213448]',
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
