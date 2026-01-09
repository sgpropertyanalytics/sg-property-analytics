/**
 * COLOR SYSTEM - Minimal, DRY, Chart.js Compatible
 *
 * Architecture:
 * 1. BASE - ~10 hex colors (single source of truth)
 * 2. alpha() - generates rgba variants on-demand
 * 3. Semantic exports - reference BASE, never duplicate
 * 4. CHART_COLORS - flat namespace for Chart.js
 */

// =============================================================================
// BASE PALETTE (Single Source of Truth)
// =============================================================================
const BASE = {
  // Blues (region gradient)
  navy: '#213448',
  ocean: '#547792',
  sky: '#94B4C1',

  // Warm tones
  sand: '#EAE0CF',
  brown: '#78503C',
  bronze: '#C4A484',

  // Supply browns (waterfall)
  supplyDark: '#6b4226',
  supplyMid: '#9c6644',
  supplyLight: '#c4a77d',
  supplyPale: '#e8dcc8',

  // Status
  emerald: '#059669',
  red: '#DC2626',
  amber: '#F59E0B',

  // Accent
  orange: '#F97316',
  orangeA11y: '#EA580C',
  blue: '#2563EB',

  // Neutrals (slate scale)
  slate100: '#F1F5F9',
  slate200: '#E5E7EB',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Surfaces
  white: '#FFFFFF',
  black: '#0A0A0A',
  surface: '#1A1A1A',
  edge: '#333333',
  canvasGrid: '#A8A29E',
};

// =============================================================================
// ALPHA FUNCTION (Generate rgba on-demand)
// =============================================================================
export const alpha = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

// =============================================================================
// SEMANTIC EXPORTS (Reference BASE - no duplication)
// =============================================================================

// Region colors (CCR = premium, OCR = suburban)
export const REGION = {
  CCR: BASE.navy,
  RCR: BASE.ocean,
  OCR: BASE.sky,
};

// Bedroom bubble colors (1BR lightest → 4BR darkest, 5BR brown accent)
export const BEADS = {
  1: alpha(BASE.sand, 0.9),
  2: alpha(BASE.sky, 0.9),
  3: alpha(BASE.ocean, 0.9),
  4: alpha(BASE.navy, 0.9),
  5: alpha(BASE.brown, 0.9),
};

// Financial delta (+/-)
export const DELTA = {
  positive: BASE.emerald,
  negative: BASE.red,
  neutral: BASE.slate500,
  positiveBg: '#ECFDF5',
  positiveText: '#047857',
  negativeBg: '#FFF1F2',
  negativeText: '#BE123C',
};

// Waterfall chart (supply pipeline)
export const WATERFALL = {
  unsoldInventory: BASE.supplyDark,
  upcomingLaunches: BASE.supplyMid,
  glsPipeline: BASE.supplyLight,
  glsExcluded: alpha(BASE.supplyLight, 0.3),
  total: BASE.supplyPale,
  spacer: 'transparent',
  connector: BASE.supplyLight,
};

export const WATERFALL_BORDER = {
  unsoldInventory: '#5a361f',
  upcomingLaunches: '#7d5236',
  glsPipeline: '#a68b64',
  glsExcluded: alpha('#a68b64', 0.5),
  total: '#d4c9b8',
};

// Exit risk liquidity zones
export const LIQUIDITY = {
  low: BASE.amber,
  healthy: BASE.emerald,
  high: BASE.red,
  unknown: BASE.slate400,
};

// Price range semantic colors
export const PRICE_RANGE = {
  below: { text: '#166534', bg: '#DCFCE7' },
  within: { text: '#1E40AF', bg: '#DBEAFE' },
  above: { text: '#9A3412', bg: '#FEF3C7' },
  unknown: { text: BASE.slate500 },
};

// Text hierarchy
export const INK = {
  primary: BASE.slate900,
  dense: BASE.slate800,
  mid: BASE.slate600,
  muted: BASE.slate400,
  light: BASE.slate300,
};

// Dark surfaces (navigation)
export const VOID = {
  base: BASE.black,
  surface: BASE.surface,
  edge: BASE.edge,
};

// Light surfaces
export const CANVAS = {
  base: '#FAFAFA',
  paper: 'transparent',
  grid: BASE.canvasGrid,
};

// Accent colors
export const SIGNAL = {
  accent: BASE.orange,
  accentA11y: BASE.orangeA11y,
  focus: BASE.blue,
};

// Luxury accent
export const BRONZE = {
  base: BASE.bronze,
  light: '#D4C4A8',
  dark: '#A08060',
};

// =============================================================================
// CHART_COLORS (Flat namespace for Chart.js - all hex/rgba)
// =============================================================================
export const CHART_COLORS = {
  // Base colors (from BASE)
  navy: BASE.navy,
  ocean: BASE.ocean,
  sky: BASE.sky,
  sand: BASE.sand,
  white: BASE.white,

  // Slate palette
  slate100: BASE.slate100,
  slate200: BASE.slate200,
  slate300: BASE.slate300,
  slate400: BASE.slate400,
  slate500: BASE.slate500,
  slate600: BASE.slate600,
  slate700: BASE.slate700,
  slate800: BASE.slate800,
  slate900: BASE.slate900,

  // Grid/axis
  grid: alpha(BASE.navy, 0.1),
  gridLight: alpha(BASE.navy, 0.05),
  axis: alpha(BASE.navy, 0.3),

  // Navy alpha variants (common)
  navyAlpha05: alpha(BASE.navy, 0.05),
  navyAlpha90: alpha(BASE.navy, 0.9),
  navyAlpha95: alpha(BASE.navy, 0.95),

  // Navy deep alpha (annotations/overlays)
  navyDeepAlpha04: alpha(BASE.navy, 0.04),
  navyDeepAlpha05: alpha(BASE.navy, 0.05),
  navyDeepAlpha08: alpha(BASE.navy, 0.08),
  navyDeepAlpha10: alpha(BASE.navy, 0.1),
  navyDeepAlpha20: alpha(BASE.navy, 0.2),
  navyDeepAlpha50: alpha(BASE.navy, 0.5),
  navyDeepAlpha80: alpha(BASE.navy, 0.8),
  navyDeepAlpha90: alpha(BASE.navy, 0.9),

  // Ocean alpha
  oceanAlpha10: alpha(BASE.ocean, 0.1),
  oceanAlpha80: alpha(BASE.ocean, 0.8),
  oceanAlpha100: BASE.ocean,

  // Sky alpha
  skyAlpha15: alpha(BASE.sky, 0.15),
  skyAlpha20: alpha(BASE.sky, 0.2),
  skyAlpha30: alpha(BASE.sky, 0.3),

  // Slate alpha
  slate500Alpha30: alpha(BASE.slate500, 0.3),
  slate500Alpha70: alpha(BASE.slate500, 0.7),

  // Status alpha (for chart zones)
  redAlpha08: alpha('#EF4444', 0.08),
  redAlpha12: alpha('#EF4444', 0.12),
  redAlpha20: alpha('#EF4444', 0.2),
  emeraldAlpha08: alpha('#10B981', 0.08),
  emeraldAlpha12: alpha('#10B981', 0.12),
  emeraldAlpha20: alpha('#10B981', 0.2),

  // Text
  textMuted: BASE.slate700,

  // Supply (waterfall legend)
  supplyUnsold: BASE.supplyDark,
  supplyUpcoming: BASE.supplyMid,
  supplyGls: BASE.supplyLight,

  // Dynamic alpha functions (for intensity-based coloring)
  slate700Alpha: (a) => alpha(BASE.slate700, a),
  oceanAlpha: (a) => alpha(BASE.ocean, a),
  navyAlpha: (a) => alpha(BASE.navy, a),
};

// Alias for backward compatibility
export const CHART = CHART_COLORS;

// =============================================================================
// TAILWIND BADGE CLASSES
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

