/**
 * Shared constants and utility functions for the SG Property Analyzer frontend
 *
 * IMPORTANT: District-to-Region mappings are SINGLE SOURCE OF TRUTH.
 * Do NOT duplicate these definitions elsewhere. Always import from here.
 */

// Import canonical enums from apiContract (Single Source of Truth for enums)
import {
  SaleType,
  SaleTypeLabels,
  Tenure,
  TenureLabels,
  TenureLabelsShort,
  getSaleTypeLabel as getContractSaleTypeLabel,
  getTenureLabel as getContractTenureLabel,
  isSaleType,
  isTenure,
} from '../schemas/apiContract';

// =============================================================================
// DISTRICT TO REGION MAPPING (URA Market Segments) - SINGLE SOURCE OF TRUTH
// =============================================================================

// Core Central Region - Premium/Prime districts
export const CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11'];

// Rest of Central Region - City fringe
export const RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20'];

// Outside Central Region - Suburban (D16-D19, D21-D28)
export const OCR_DISTRICTS = ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28'];

/**
 * Get the market segment/region for a given district
 * @param {string} district - District code (e.g., 'D01', 'D07', '07')
 * @returns {'CCR' | 'RCR' | 'OCR'} Market segment
 */
export const getRegionForDistrict = (district) => {
  if (!district) return 'OCR';
  let d = district.toString().toUpperCase().trim();
  if (!d.startsWith('D')) {
    d = `D${d.padStart(2, '0')}`;
  }
  if (CCR_DISTRICTS.includes(d)) return 'CCR';
  if (RCR_DISTRICTS.includes(d)) return 'RCR';
  return 'OCR';
};

/**
 * Get all districts for a given market segment/region
 * @param {'CCR' | 'RCR' | 'OCR'} region - Market segment
 * @returns {string[]} Array of district codes
 */
export const getDistrictsForRegion = (region) => {
  const r = (region || '').toUpperCase();
  if (r === 'CCR') return CCR_DISTRICTS;
  if (r === 'RCR') return RCR_DISTRICTS;
  if (r === 'OCR') return OCR_DISTRICTS;
  return [];
};

/**
 * Check if a district belongs to a specific region
 * @param {string} district - District code
 * @param {'CCR' | 'RCR' | 'OCR'} region - Market segment to check
 * @returns {boolean}
 */
export const isDistrictInRegion = (district, region) => {
  return getRegionForDistrict(district) === region.toUpperCase();
};

// =============================================================================
// DISTRICT NAMES
// =============================================================================

// District names mapping (D01-D28)
export const DISTRICT_NAMES = {
  'D01': 'Boat Quay / Raffles Place / Marina Downtown / Suntec City',
  'D02': 'Shenton Way / Tanjong Pagar',
  'D03': 'Queenstown / Alexandra / Tiong Bahru',
  'D04': 'Harbourfront / Keppel / Telok Blangah',
  'D05': 'Buona Vista / Dover / Pasir Panjang',
  'D06': 'City Hall / Fort Canning',
  'D07': 'Bugis / Rochor',
  'D08': 'Little India / Farrer Park',
  'D09': 'Orchard / Somerset / River Valley',
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D11': 'Newton / Novena / Dunearn / Watten',
  'D12': 'Balestier / Whampoa / Toa Payoh / Boon Keng / Bendemeer / Kampong Bugis',
  'D13': 'Potong Pasir / Bidadari / MacPherson / Upper Aljunied',
  'D14': 'Geylang / Dakota / Paya Lebar Central / Eunos / Ubi / Aljunied',
  'D15': 'Tanjong Rhu / Amber / Meyer / Katong / Dunman / Joo Chiat / Marine Parade',
  'D16': 'Bedok / Upper East Coast / Eastwood / Kew Drive',
  'D17': 'Loyang / Changi',
  'D18': 'Tampines / Pasir Ris',
  'D19': 'Serangoon Garden / Hougang / Sengkang / Punggol',
  'D20': 'Bishan / Ang Mo Kio',
  'D21': 'Upper Bukit Timah / Clementi Park / Ulu Pandan',
  'D22': 'Jurong / Boon Lay / Tuas',
  'D23': 'Bukit Batok / Bukit Panjang / Choa Chu Kang',
  'D24': 'Lim Chu Kang / Tengah',
  'D25': 'Kranji / Woodlands',
  'D26': 'Upper Thomson / Springleaf',
  'D27': 'Yishun / Sembawang',
  'D28': 'Seletar / Yio Chu Kang',
};

// Bedroom labels for display
export const BEDROOM_LABELS = {
  '1b': '1-Bedroom',
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
  '5b': '5-Bedroom+',
};

// Short bedroom labels (for compact UI like filters)
export const BEDROOM_LABELS_SHORT = {
  1: '1BR',
  2: '2BR',
  3: '3BR',
  4: '4BR',
  5: '5BR+',
};

/**
 * Get short bedroom label for display (e.g., "2BR", "5BR+")
 * @param {number|string} bedroom - Bedroom count (1-5)
 * @returns {string} Short label like "2BR"
 */
export const getBedroomLabelShort = (bedroom) => {
  const num = parseInt(bedroom, 10);
  if (num >= 5) return '5BR+';
  return BEDROOM_LABELS_SHORT[num] || `${num}BR`;
};

/**
 * Get full bedroom label for display (e.g., "2-Bedroom", "5-Bedroom+")
 * @param {number|string} bedroom - Bedroom count (1-5)
 * @returns {string} Full label like "2-Bedroom"
 */
export const getBedroomLabelFull = (bedroom) => {
  const num = parseInt(bedroom, 10);
  if (num >= 5) return '5-Bedroom+';
  return BEDROOM_LABELS[`${num}b`] || `${num}-Bedroom`;
};

/**
 * Format a price value for display
 * @param {number} value - The price value
 * @returns {string} Formatted price string (e.g., "$2.41M", "$500K")
 */
export const formatPrice = (value) => {
  if (!value) return '-';
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

/**
 * Format a PSF (price per square foot) value for display
 * @param {number} value - The PSF value
 * @returns {string} Formatted PSF string (e.g., "$1,823")
 */
export const formatPSF = (value) => {
  if (!value) return '-';
  return `$${value.toLocaleString()}`;
};

// =============================================================================
// FLOOR LEVEL CLASSIFICATION - SINGLE SOURCE OF TRUTH
// =============================================================================

/**
 * Floor level tiers in display order (low to high)
 * Matches backend classification in classifier_extended.py
 */
export const FLOOR_LEVELS = ['Low', 'Mid-Low', 'Mid', 'Mid-High', 'High', 'Luxury'];

/**
 * Floor level display labels with floor ranges (for chart x-axis)
 * Format: "Classification (Floor Range)"
 */
export const FLOOR_LEVEL_LABELS = {
  'Low': 'Low (01-05)',
  'Mid-Low': 'Mid-Low (06-10)',
  'Mid': 'Mid (11-20)',
  'Mid-High': 'Mid-High (21-30)',
  'High': 'High (31-40)',
  'Luxury': 'Luxury (41+)',
  'Unknown': 'Unknown',
};

/**
 * Floor level short labels for compact UI (just the classification)
 */
export const FLOOR_LEVEL_LABELS_SHORT = {
  'Low': 'Low',
  'Mid-Low': 'Mid-Low',
  'Mid': 'Mid',
  'Mid-High': 'Mid-High',
  'High': 'High',
  'Luxury': 'Luxury',
  'Unknown': 'Unknown',
};

/**
 * Floor range only labels (for very compact displays)
 */
export const FLOOR_RANGE_LABELS = {
  'Low': '01-05',
  'Mid-Low': '06-10',
  'Mid': '11-20',
  'Mid-High': '21-30',
  'High': '31-40',
  'Luxury': '41+',
  'Unknown': '?',
};

/**
 * Floor level colors for charts (palette-consistent)
 * Gradient from lighter to darker representing floor height
 */
export const FLOOR_LEVEL_COLORS = {
  'Low': 'rgba(148, 180, 193, 0.8)',      // #94B4C1 - Sky Blue (lightest)
  'Mid-Low': 'rgba(120, 156, 175, 0.8)',  // Blend
  'Mid': 'rgba(84, 119, 146, 0.8)',       // #547792 - Ocean Blue
  'Mid-High': 'rgba(60, 90, 115, 0.8)',   // Blend
  'High': 'rgba(33, 52, 72, 0.8)',        // #213448 - Deep Navy
  'Luxury': 'rgba(139, 115, 85, 0.9)',    // Gold/Bronze for luxury
  'Unknown': 'rgba(200, 200, 200, 0.5)',  // Gray
};

/**
 * Get floor level label for display
 * @param {string} floorLevel - Floor level classification
 * @param {boolean} short - Use short label
 * @returns {string} Display label
 */
export const getFloorLevelLabel = (floorLevel, short = false) => {
  if (!floorLevel) return 'Unknown';
  return short
    ? (FLOOR_LEVEL_LABELS_SHORT[floorLevel] || floorLevel)
    : (FLOOR_LEVEL_LABELS[floorLevel] || floorLevel);
};

/**
 * Get floor level color for charts
 * @param {string} floorLevel - Floor level classification
 * @returns {string} RGBA color string
 */
export const getFloorLevelColor = (floorLevel) => {
  return FLOOR_LEVEL_COLORS[floorLevel] || FLOOR_LEVEL_COLORS['Unknown'];
};

/**
 * Get floor level index for sorting (0 = Low, 5 = Luxury)
 * @param {string} floorLevel - Floor level classification
 * @returns {number} Sort index (0-5, or 6 for Unknown)
 */
export const getFloorLevelIndex = (floorLevel) => {
  const index = FLOOR_LEVELS.indexOf(floorLevel);
  return index >= 0 ? index : 6; // Unknown goes last
};

// =============================================================================
// SALE TYPE CLASSIFICATION - USES CANONICAL ENUMS FROM apiContract.js
// =============================================================================

// Re-export enums for convenience
export { SaleType, SaleTypeLabels, Tenure, TenureLabels, TenureLabelsShort, isSaleType, isTenure };

/**
 * Sale type enum values as array (for iteration)
 */
export const SALE_TYPE_VALUES = [SaleType.NEW_SALE, SaleType.RESALE, SaleType.SUB_SALE];

/**
 * Sale type options for dropdowns/selects (uses DB values for backend compatibility)
 * Each option has { value: dbString, label: displayString }
 */
export const SALE_TYPE_OPTIONS = SALE_TYPE_VALUES.map(v => ({
  value: SaleTypeLabels[v],  // DB string value: 'New Sale', 'Resale', 'Sub Sale'
  label: SaleTypeLabels[v],
}));

/**
 * Legacy: DB string values (for backward compatibility during migration)
 * @deprecated Use SALE_TYPE_VALUES with enum values instead
 */
export const SALE_TYPES = ['New Sale', 'Resale', 'Sub Sale'];

/**
 * Legacy: Sale type display labels keyed by DB string
 * @deprecated Use SaleTypeLabels from apiContract instead
 */
export const SALE_TYPE_LABELS = {
  'New Sale': 'New Sale',
  'Resale': 'Resale',
  'Sub Sale': 'Sub Sale',
};

/**
 * Get sale type label for display (handles both enum and DB string)
 */
export const getSaleTypeLabel = getContractSaleTypeLabel;

/**
 * Check if a sale type value is valid (handles both enum and DB string)
 */
export const isValidSaleType = (saleType) => {
  return SALE_TYPE_VALUES.includes(saleType) || SALE_TYPES.includes(saleType);
};

// =============================================================================
// TENURE CLASSIFICATION - USES CANONICAL ENUMS FROM apiContract.js
// =============================================================================

/**
 * Tenure enum values as array (for iteration)
 */
export const TENURE_VALUES = [Tenure.FREEHOLD, Tenure.LEASEHOLD_99, Tenure.LEASEHOLD_999];

/**
 * Tenure options for dropdowns/selects (uses DB values for backend compatibility)
 * Each option has { value: dbString, label: displayString }
 */
export const TENURE_OPTIONS = TENURE_VALUES.map(v => ({
  value: TenureLabels[v],  // DB string value: 'Freehold', '99-year', '999-year'
  label: TenureLabels[v],
}));

/**
 * Legacy: DB string values (for backward compatibility during migration)
 * @deprecated Use TENURE_VALUES with enum values instead
 */
export const TENURE_TYPES = ['Freehold', '99-year', '999-year'];

/**
 * Legacy: Tenure type display labels keyed by DB string (full)
 * @deprecated Use TenureLabels from apiContract instead
 */
export const TENURE_TYPE_LABELS = {
  'Freehold': 'Freehold',
  '99-year': '99-year Leasehold',
  '999-year': '999-year Leasehold',
};

/**
 * Legacy: Tenure type short labels keyed by DB string
 * @deprecated Use TenureLabelsShort from apiContract instead
 */
export const TENURE_TYPE_LABELS_SHORT = {
  'Freehold': 'FH',
  '99-year': '99yr',
  '999-year': '999yr',
};

/**
 * Get tenure label for display (handles both enum and DB string)
 */
export const getTenureLabel = getContractTenureLabel;

/**
 * Check if a tenure value is valid (handles both enum and DB string)
 */
export const isValidTenure = (tenure) => {
  return TENURE_VALUES.includes(tenure) || TENURE_TYPES.includes(tenure);
};

// =============================================================================
// PROPERTY AGE BANDS - SINGLE SOURCE OF TRUTH
// Matches backend/services/budget_analysis_service.py PROPERTY_AGE_BANDS
// =============================================================================

/**
 * Property age band definitions
 * - new_sale: Based on sale_type, not property age
 * - Age bands use >= min and < max boundaries
 * - just_top: Special band for 0-3 year old properties (not in heatmap API)
 */
export const PROPERTY_AGE_BANDS = [
  { key: 'new_sale', label: 'New Sale', isNewSale: true, minAge: null, maxAge: null },
  { key: 'just_top', label: 'Just TOP', isNewSale: false, minAge: 0, maxAge: 4 },
  { key: 'recently_top', label: 'Recently TOP', isNewSale: false, minAge: 4, maxAge: 8 },
  { key: 'young_resale', label: 'Young Resale', isNewSale: false, minAge: 8, maxAge: 15 },
  { key: 'resale', label: 'Resale', isNewSale: false, minAge: 15, maxAge: 25 },
  { key: 'old_resale', label: 'Old Resale', isNewSale: false, minAge: 25, maxAge: null },
];

/**
 * Age band labels with year ranges (for display in legends/headers)
 */
export const AGE_BAND_LABELS_FULL = {
  new_sale: 'New Sale',
  just_top: 'Just TOP (0-3 yrs)',
  recently_top: 'Recently TOP (4-8 yrs)',
  young_resale: 'Young Resale (8-15 yrs)',
  resale: 'Resale (15-25 yrs)',
  old_resale: 'Old Resale (25+ yrs)',
  freehold: 'Freehold',
};

/**
 * Age band short labels (for compact displays like table cells)
 */
export const AGE_BAND_LABELS_SHORT = {
  new_sale: 'New',
  just_top: 'Just TOP',
  recently_top: 'Recently TOP',
  young_resale: 'Young Resale',
  resale: 'Resale',
  old_resale: 'Old Resale',
  freehold: 'FH',
};

/**
 * Get age band key from property age
 * Matches backend SQL logic: age >= min AND age < max
 *
 * @param {number|null} age - Property age in years
 * @param {boolean} isFreehold - Whether property is freehold (no reliable TOP date)
 * @returns {string} Age band key
 */
export const getAgeBandKey = (age, isFreehold = false) => {
  if (isFreehold) return 'freehold';
  if (age === null || age === undefined) return null;
  if (age < 4) return 'just_top';
  if (age < 8) return 'recently_top';
  if (age < 15) return 'young_resale';
  if (age < 25) return 'resale';
  return 'old_resale';
};

/**
 * Get age band label for display
 *
 * @param {number|null} age - Property age in years
 * @param {boolean} isFreehold - Whether property is freehold
 * @param {boolean} short - Use short label (default: true)
 * @returns {string} Display label
 */
export const getAgeBandLabel = (age, isFreehold = false, short = true) => {
  const key = getAgeBandKey(age, isFreehold);
  if (!key) return '-';
  return short ? AGE_BAND_LABELS_SHORT[key] : AGE_BAND_LABELS_FULL[key];
};

/**
 * Get tooltip text for age band (useful for FH explanation)
 *
 * @param {string} bandKey - Age band key
 * @returns {string|null} Tooltip text or null
 */
export const getAgeBandTooltip = (bandKey) => {
  if (bandKey === 'freehold') return 'Freehold (age not available)';
  return null;
};

// =============================================================================
// LIQUIDITY HEATMAP COLORS
// =============================================================================

/**
 * Liquidity color scale for floor liquidity heatmap
 * Uses blue gradient: darker = more liquid (buyer-intuitive)
 */
export const LIQUIDITY_COLORS = {
  very_liquid: '#1e40af',    // Dark Blue (Z >= +0.75)
  liquid: '#3b82f6',         // Blue (+0.25 to +0.75)
  neutral: '#94a3b8',        // Gray (-0.25 to +0.25)
  illiquid: '#bfdbfe',       // Light Blue (-0.75 to -0.25)
  very_illiquid: '#dbeafe',  // Lightest Blue (Z <= -0.75)
  insufficient: '#f3f4f6',   // Gray (< 5 transactions)
};

/**
 * Get liquidity color based on Z-score and sample size
 * @param {number} zScore - Z-score of velocity within project
 * @param {number} count - Transaction count for this zone
 * @param {number} minCount - Minimum count for valid data (default: 5)
 * @returns {string} Hex color code
 */
export const getLiquidityColor = (zScore, count, minCount = 5) => {
  if (count < minCount) return LIQUIDITY_COLORS.insufficient;
  if (zScore >= 0.75) return LIQUIDITY_COLORS.very_liquid;
  if (zScore >= 0.25) return LIQUIDITY_COLORS.liquid;
  if (zScore >= -0.25) return LIQUIDITY_COLORS.neutral;
  if (zScore >= -0.75) return LIQUIDITY_COLORS.illiquid;
  return LIQUIDITY_COLORS.very_illiquid;
};

/**
 * Get liquidity label from Z-score
 * @param {number} zScore - Z-score of velocity within project
 * @returns {string} Label text
 */
export const getLiquidityLabel = (zScore) => {
  if (zScore >= 0.75) return 'Very Liquid';
  if (zScore >= 0.25) return 'Liquid';
  if (zScore >= -0.25) return 'Neutral';
  if (zScore >= -0.75) return 'Illiquid';
  return 'Very Illiquid';
};
