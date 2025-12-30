/**
 * API Contract Enums
 *
 * Enum values, labels, and type-checking helpers for API v2+ responses.
 */

import { getContract } from '../../generated/apiContract';

const warnOrThrow = (message) => {
  if (import.meta.env.MODE === 'test') {
    throw new Error(message);
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(message);
  }
};

const assertEnumMatch = (name, expected, actual, normalize = (val) => val) => {
  if (!expected || expected.length === 0) return;
  const expectedSet = new Set(expected.map(normalize));
  const actualSet = new Set(actual.map(normalize));
  for (const value of expectedSet) {
    if (!actualSet.has(value)) {
      warnOrThrow(`[API CONTRACT] ${name} enum missing value: ${value}`);
      break;
    }
  }
};

// =============================================================================
// SALE TYPE
// =============================================================================

/**
 * Sale type enum values.
 */
export const SaleType = {
  NEW_SALE: 'new_sale',
  RESALE: 'resale',
  SUB_SALE: 'sub_sale',
};

/**
 * Display labels for sale types.
 */
export const SaleTypeLabels = {
  [SaleType.NEW_SALE]: 'New Sale',
  [SaleType.RESALE]: 'Resale',
  [SaleType.SUB_SALE]: 'Sub Sale',
};

export const isSaleType = {
  newSale: (val) => val === SaleType.NEW_SALE,
  resale: (val) => val === SaleType.RESALE,
  subSale: (val) => val === SaleType.SUB_SALE,
};

/**
 * Get display label for any sale type value.
 */
export const getSaleTypeLabel = (val) => {
  if (!val) return 'Unknown';
  if (SaleTypeLabels[val]) return SaleTypeLabels[val];
  return val;
};

// =============================================================================
// TENURE
// =============================================================================

/**
 * Tenure type enum values.
 */
export const Tenure = {
  FREEHOLD: 'freehold',
  LEASEHOLD_99: '99_year',
  LEASEHOLD_999: '999_year',
};

/**
 * Display labels for tenure types.
 */
export const TenureLabels = {
  [Tenure.FREEHOLD]: 'Freehold',
  [Tenure.LEASEHOLD_99]: '99-year',
  [Tenure.LEASEHOLD_999]: '999-year',
};

/**
 * Short labels for tenure types (for compact display).
 */
export const TenureLabelsShort = {
  [Tenure.FREEHOLD]: 'FH',
  [Tenure.LEASEHOLD_99]: '99yr',
  [Tenure.LEASEHOLD_999]: '999yr',
};

/**
 * Get display label for any tenure value.
 */
export const getTenureLabel = (val, short = false) => {
  if (!val) return 'Unknown';
  const labels = short ? TenureLabelsShort : TenureLabels;
  if (labels[val]) return labels[val];
  return val;
};

export const isTenure = {
  freehold: (val) => val === Tenure.FREEHOLD,
  leasehold99: (val) => val === Tenure.LEASEHOLD_99,
  leasehold999: (val) => val === Tenure.LEASEHOLD_999,
};

// =============================================================================
// REGION
// =============================================================================

/**
 * Region/market segment enum values.
 */
export const Region = {
  CCR: 'ccr',
  RCR: 'rcr',
  OCR: 'ocr',
};

/**
 * Display labels for regions.
 */
export const RegionLabels = {
  [Region.CCR]: 'CCR',
  [Region.RCR]: 'RCR',
  [Region.OCR]: 'OCR',
};

const regionAllowed =
  getContract('aggregate')?.param_schema?.fields?.segment?.allowed_values ||
  getContract('dashboard')?.param_schema?.fields?.segment?.allowed_values ||
  [];
assertEnumMatch(
  'Region',
  regionAllowed,
  Object.values(Region),
  (val) => String(val).toLowerCase()
);

// =============================================================================
// FLOOR LEVEL
// =============================================================================

/**
 * Floor level enum values (API format - lowercase).
 *
 * Source of truth: backend/services/classifier_extended.py
 * Floor Classification Tiers:
 *   01-05  → Low
 *   06-10  → Mid-Low
 *   11-20  → Mid
 *   21-30  → Mid-High
 *   31-40  → High
 *   41+    → Luxury
 */
export const FloorLevel = {
  LOW: 'low',
  MID_LOW: 'mid_low',
  MID: 'mid',
  MID_HIGH: 'mid_high',
  HIGH: 'high',
  LUXURY: 'luxury',
  UNKNOWN: 'unknown',
};

/**
 * Display labels for floor levels (with floor ranges).
 */
export const FloorLevelLabels = {
  [FloorLevel.LOW]: 'Low (01-05)',
  [FloorLevel.MID_LOW]: 'Mid-Low (06-10)',
  [FloorLevel.MID]: 'Mid (11-20)',
  [FloorLevel.MID_HIGH]: 'Mid-High (21-30)',
  [FloorLevel.HIGH]: 'High (31-40)',
  [FloorLevel.LUXURY]: 'Luxury (41+)',
  [FloorLevel.UNKNOWN]: 'Unknown',
};

const floorLevelAllowed =
  getContract('transactions/price-growth')?.param_schema?.fields?.floor_level?.allowed_values ||
  [];
assertEnumMatch(
  'FloorLevel',
  floorLevelAllowed,
  Object.values(FloorLevel),
  (val) => String(val).toLowerCase().replace(/-/g, '_')
);

/**
 * Short labels for floor levels (just the classification name).
 */
export const FloorLevelLabelsShort = {
  [FloorLevel.LOW]: 'Low',
  [FloorLevel.MID_LOW]: 'Mid-Low',
  [FloorLevel.MID]: 'Mid',
  [FloorLevel.MID_HIGH]: 'Mid-High',
  [FloorLevel.HIGH]: 'High',
  [FloorLevel.LUXURY]: 'Luxury',
  [FloorLevel.UNKNOWN]: 'Unknown',
};

export const isFloorLevel = {
  low: (val) => val === FloorLevel.LOW,
  midLow: (val) => val === FloorLevel.MID_LOW,
  mid: (val) => val === FloorLevel.MID,
  midHigh: (val) => val === FloorLevel.MID_HIGH,
  high: (val) => val === FloorLevel.HIGH,
  luxury: (val) => val === FloorLevel.LUXURY,
  unknown: (val) => val === FloorLevel.UNKNOWN,
};

/**
 * Get display label for any floor level value.
 */
export const getFloorLevelLabel = (val, short = false) => {
  if (!val) return 'Unknown';
  const labels = short ? FloorLevelLabelsShort : FloorLevelLabels;
  return labels[val] || val;
};

// =============================================================================
// PROPERTY AGE BUCKET
// =============================================================================

/**
 * Property age bucket enum values.
 *
 * Age calculation: floor(transaction_year - lease_start_year)
 * This is "lease age" (years since lease commencement), NOT building age.
 *
 * IMPORTANT:
 * - new_sale is a market state (0 resale transactions), not age-based
 * - freehold is tenure-based (no lease), not age-based
 * - Age boundaries use exclusive upper bounds: [min, max)
 */
export const PropertyAgeBucket = {
  NEW_SALE: 'new_sale',
  RECENTLY_TOP: 'recently_top',
  YOUNG_RESALE: 'young_resale',
  RESALE: 'resale',
  MATURE_RESALE: 'mature_resale',
  FREEHOLD: 'freehold',
};

/**
 * Display labels for property age buckets.
 */
export const PropertyAgeBucketLabels = {
  [PropertyAgeBucket.NEW_SALE]: 'New Sale (No Resales Yet)',
  [PropertyAgeBucket.RECENTLY_TOP]: 'Recently TOP (4-7 years)',
  [PropertyAgeBucket.YOUNG_RESALE]: 'Young Resale (8-15 years)',
  [PropertyAgeBucket.RESALE]: 'Resale (15-25 years)',
  [PropertyAgeBucket.MATURE_RESALE]: 'Mature Resale (25+ years)',
  [PropertyAgeBucket.FREEHOLD]: 'Freehold',
};

/**
 * Short labels for property age buckets (for compact display).
 */
export const PropertyAgeBucketLabelsShort = {
  [PropertyAgeBucket.NEW_SALE]: 'New Sale',
  [PropertyAgeBucket.RECENTLY_TOP]: 'Recently TOP',
  [PropertyAgeBucket.YOUNG_RESALE]: 'Young Resale',
  [PropertyAgeBucket.RESALE]: 'Resale',
  [PropertyAgeBucket.MATURE_RESALE]: 'Mature',
  [PropertyAgeBucket.FREEHOLD]: 'Freehold',
};

/**
 * Tooltip descriptions for property age buckets (with age ranges).
 */
export const PropertyAgeBucketTooltips = {
  [PropertyAgeBucket.NEW_SALE]: null,
  [PropertyAgeBucket.RECENTLY_TOP]: '4–8 years',
  [PropertyAgeBucket.YOUNG_RESALE]: '8–15 years',
  [PropertyAgeBucket.RESALE]: '15–25 years',
  [PropertyAgeBucket.MATURE_RESALE]: '25+ years',
  [PropertyAgeBucket.FREEHOLD]: null,
};

/**
 * Helpers to check property age bucket values.
 */
export const isPropertyAgeBucket = {
  newSale: (val) => val === PropertyAgeBucket.NEW_SALE,
  recentlyTop: (val) => val === PropertyAgeBucket.RECENTLY_TOP,
  youngResale: (val) => val === PropertyAgeBucket.YOUNG_RESALE,
  resale: (val) => val === PropertyAgeBucket.RESALE,
  matureResale: (val) => val === PropertyAgeBucket.MATURE_RESALE,
  freehold: (val) => val === PropertyAgeBucket.FREEHOLD,
  // Utility helpers
  isAgeBased: (val) => ![PropertyAgeBucket.NEW_SALE, PropertyAgeBucket.FREEHOLD].includes(val),
  isYoung: (val) => [PropertyAgeBucket.RECENTLY_TOP, PropertyAgeBucket.YOUNG_RESALE].includes(val),
  isMature: (val) => [PropertyAgeBucket.RESALE, PropertyAgeBucket.MATURE_RESALE].includes(val),
};

/**
 * Get display label for any property age bucket value.
 */
export const getPropertyAgeBucketLabel = (val, short = false) => {
  if (!val) return 'All';
  const labels = short ? PropertyAgeBucketLabelsShort : PropertyAgeBucketLabels;
  return labels[val] || val;
};

// =============================================================================
// PREMIUM TREND
// =============================================================================

/**
 * Premium trend enum values (for New vs Resale comparison).
 * Indicates direction of premium gap between new launches and resales.
 */
export const PremiumTrend = {
  WIDENING: 'widening',
  NARROWING: 'narrowing',
  STABLE: 'stable',
};

/**
 * Display labels for premium trends.
 */
export const PremiumTrendLabels = {
  [PremiumTrend.WIDENING]: 'Gap widening',
  [PremiumTrend.NARROWING]: 'Gap narrowing',
  [PremiumTrend.STABLE]: 'Stable',
};

/**
 * Helpers to check premium trend values.
 */
export const isPremiumTrend = {
  widening: (val) => val === PremiumTrend.WIDENING,
  narrowing: (val) => val === PremiumTrend.NARROWING,
  stable: (val) => val === PremiumTrend.STABLE,
};

// =============================================================================
// FLOOR DIRECTION (Price Band Trend)
// =============================================================================

/**
 * Floor direction enum values (for price band/floor analysis).
 * Indicates direction of price floor movement over time.
 */
export const FloorDirection = {
  RISING: 'rising',
  WEAKENING: 'weakening',
  FLAT: 'flat',
  UNKNOWN: 'unknown',
};

/**
 * Display labels for floor direction.
 */
export const FloorDirectionLabels = {
  [FloorDirection.RISING]: '↑ Rising',
  [FloorDirection.WEAKENING]: '↓ Weakening',
  [FloorDirection.FLAT]: '→ Stable',
};

/**
 * Helpers to check floor direction values.
 */
export const isFloorDirection = {
  rising: (val) => val === FloorDirection.RISING,
  weakening: (val) => val === FloorDirection.WEAKENING,
  flat: (val) => val === FloorDirection.FLAT,
  unknown: (val) => val === FloorDirection.UNKNOWN,
};

// =============================================================================
// BEDROOM
// =============================================================================

/**
 * Bedroom enum values (matches backend Bedroom class).
 */
export const Bedroom = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE_PLUS: '5_plus',
};
