/**
 * COLOR SYSTEM - Single Source of Truth
 * All values are hex/rgba - works with Chart.js, DOM, everywhere.
 *
 * Philosophy: Original blues palette (navy/ocean/sky) with warm accents.
 */

// =============================================================================
// REGION (blue gradient for CCR → RCR → OCR)
// =============================================================================
export const REGION = {
  CCR: '#213448',  // Navy - darkest (Core Central)
  RCR: '#547792',  // Ocean - medium (Rest of Central)
  OCR: '#94B4C1',  // Sky - lightest (Outside Central)
};

// =============================================================================
// BEADS (bedroom bubbles - sand to navy progression)
// =============================================================================
export const BEADS = {
  1: 'rgba(234, 224, 207, 0.9)',  // Sand - lightest
  2: 'rgba(148, 180, 193, 0.9)',  // Sky
  3: 'rgba(84, 119, 146, 0.9)',   // Ocean
  4: 'rgba(33, 52, 72, 0.9)',     // Navy - darkest
  5: 'rgba(120, 80, 60, 0.9)',    // Brown accent for 5BR
};

// =============================================================================
// DELTA (financial +/-)
// =============================================================================
export const DELTA = {
  positive: '#059669',  // Emerald
  negative: '#DC2626',  // Red
  neutral: '#64748B',   // Gray
  // Pill badge variants
  positiveBg: '#ECFDF5',
  positiveText: '#047857',
  negativeBg: '#FFF1F2',
  negativeText: '#BE123C',
};

// =============================================================================
// SUPPLY (waterfall chart - warm browns)
// =============================================================================
export const SUPPLY = {
  unsold: '#6b4226',
  upcoming: '#9c6644',
  gls: '#c4a77d',
  total: '#e8dcc8',
};

// =============================================================================
// WATERFALL (explicit waterfall chart colors with borders)
// =============================================================================
export const WATERFALL = {
  unsoldInventory: '#6b4226',
  upcomingLaunches: '#9c6644',
  glsPipeline: '#c4a77d',
  glsExcluded: 'rgba(196, 167, 125, 0.3)',
  total: '#e8dcc8',
  spacer: 'transparent',
  connector: '#c4a77d',
};

export const WATERFALL_BORDER = {
  unsoldInventory: '#5a361f',
  upcomingLaunches: '#7d5236',
  glsPipeline: '#a68b64',
  glsExcluded: 'rgba(166, 139, 100, 0.5)',
  total: '#d4c9b8',
};

// =============================================================================
// CHART (general chart colors - replaces CHART_COLORS)
// =============================================================================
export const CHART = {
  // Base colors
  navy: '#213448',
  ocean: '#547792',
  sky: '#94B4C1',
  sand: '#EAE0CF',
  white: '#FFFFFF',

  // Slate palette for bars/grids
  slate100: '#F1F5F9',
  slate200: '#E5E7EB',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Grid and axis
  grid: 'rgba(33, 52, 72, 0.1)',
  gridLight: 'rgba(33, 52, 72, 0.05)',
  axis: 'rgba(33, 52, 72, 0.3)',

  // Alpha variants (most commonly used)
  navyAlpha05: 'rgba(33, 52, 72, 0.05)',
  navyAlpha90: 'rgba(33, 52, 72, 0.9)',
  navyAlpha95: 'rgba(33, 52, 72, 0.95)',
  oceanAlpha10: 'rgba(84, 119, 146, 0.1)',
  oceanAlpha80: 'rgba(84, 119, 146, 0.8)',
  oceanAlpha100: 'rgba(84, 119, 146, 1)',
  skyAlpha15: 'rgba(148, 180, 193, 0.15)',
  skyAlpha20: 'rgba(148, 180, 193, 0.2)',
  slate500Alpha70: 'rgba(100, 116, 139, 0.7)',
  slate500Alpha30: 'rgba(100, 116, 139, 0.3)',

  // Status colors for charts
  redAlpha08: 'rgba(239, 68, 68, 0.08)',
  redAlpha12: 'rgba(239, 68, 68, 0.12)',
  redAlpha20: 'rgba(239, 68, 68, 0.2)',
  emeraldAlpha08: 'rgba(16, 185, 129, 0.08)',
  emeraldAlpha12: 'rgba(16, 185, 129, 0.12)',
  emeraldAlpha20: 'rgba(16, 185, 129, 0.2)',

  // Text
  textMuted: '#374151',
};

// Dynamic alpha function for intensity-based coloring
CHART.slate700Alpha = (alpha) => `rgba(51, 65, 85, ${alpha})`;

// =============================================================================
// INK (text colors)
// =============================================================================
export const INK = {
  primary: '#0F172A',   // Slate 900 - headers
  dense: '#1E293B',     // Slate 800
  mid: '#475569',       // Slate 600 - body
  muted: '#94A3B8',     // Slate 400 - placeholders
  light: '#CBD5E1',     // Slate 300
};

// =============================================================================
// VOID (dark surfaces - navigation)
// =============================================================================
export const VOID = {
  base: '#0A0A0A',
  surface: '#1A1A1A',
  edge: '#333333',
};

// =============================================================================
// CANVAS (light surfaces)
// =============================================================================
export const CANVAS = {
  base: '#FAFAFA',
  paper: 'transparent',
  grid: '#A8A29E',
};

// =============================================================================
// SIGNAL (accent colors)
// =============================================================================
export const SIGNAL = {
  accent: '#F97316',     // Orange 500
  accentA11y: '#EA580C', // Orange 600 (accessible)
  focus: '#2563EB',      // Blue 600
};

// =============================================================================
// BRONZE (luxury accent)
// =============================================================================
export const BRONZE = {
  base: '#C4A484',
  light: '#D4C4A8',
  dark: '#A08060',
};

// =============================================================================
// LIQUIDITY (exit risk zones)
// =============================================================================
export const LIQUIDITY = {
  low: '#F59E0B',      // Amber
  healthy: '#059669',  // Emerald
  high: '#DC2626',     // Red
  unknown: '#94A3B8',  // Gray
};

// =============================================================================
// STATUS
// =============================================================================
export const STATUS = {
  live: '#059669',
  positive: '#059669',
  negative: '#DC2626',
};

// =============================================================================
// PRICE_RANGE (semantic colors)
// =============================================================================
export const PRICE_RANGE = {
  below: { text: '#166534', bg: '#DCFCE7' },
  within: { text: '#1E40AF', bg: '#DBEAFE' },
  above: { text: '#9A3412', bg: '#FEF3C7' },
  unknown: { text: '#6B7280' },
};

// =============================================================================
// BADGE CLASSES (Tailwind)
// =============================================================================
export const REGION_BADGE_CLASSES = {
  CCR: 'bg-slate-900 text-white',
  RCR: 'bg-slate-700 text-white',
  OCR: 'bg-slate-500 text-white',
};

export const DELTA_PILL_CLASSES = {
  positive: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  negative: 'bg-rose-50 text-rose-700 border border-rose-100',
  neutral: 'bg-slate-50 text-slate-600 border border-slate-100',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
export const getRegionColor = (region) => {
  const r = (region || '').toUpperCase();
  return REGION[r] || REGION.OCR;
};

export const getRegionBadgeClass = (region) => {
  const r = (region || '').toUpperCase();
  return REGION_BADGE_CLASSES[r] || REGION_BADGE_CLASSES.OCR;
};

// =============================================================================
// BACKWARD COMPATIBILITY - CHART_COLORS alias
// =============================================================================
export const CHART_COLORS = CHART;
