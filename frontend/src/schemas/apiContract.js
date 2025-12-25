/**
 * API Contract Schema v2 - Single Source of Truth
 *
 * Defines the stable API interface between backend and frontend.
 * Must match backend/schemas/api_contract.py
 *
 * - Enums: lowercase snake_case (new_sale, resale, sub_sale)
 * - Response fields: camelCase (projectName, bedroomCount)
 * - Includes helpers for backwards compatibility during migration
 */

export const API_CONTRACT_VERSION = 'v2';

// =============================================================================
// ENUM VALUES (what API returns in v2)
// =============================================================================

/**
 * Sale type enum values.
 * API returns these lowercase values in v2, but DB stores 'New Sale', 'Resale', etc.
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

/**
 * Helpers to check sale type regardless of v1 (DB) or v2 (API) format.
 * Use these during the migration period when responses may contain either format.
 */
export const isSaleType = {
  newSale: (val) => val === SaleType.NEW_SALE || val === 'New Sale',
  resale: (val) => val === SaleType.RESALE || val === 'Resale',
  subSale: (val) => val === SaleType.SUB_SALE || val === 'Sub Sale',
};

/**
 * Get display label for any sale type value (v1 or v2 format).
 */
export const getSaleTypeLabel = (val) => {
  if (!val) return 'Unknown';
  // Handle v2 enum
  if (SaleTypeLabels[val]) return SaleTypeLabels[val];
  // Handle v1 DB value (already a label)
  if (['New Sale', 'Resale', 'Sub Sale'].includes(val)) return val;
  return val;
};

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
 * Get display label for any tenure value (v1 or v2 format).
 */
export const getTenureLabel = (val, short = false) => {
  if (!val) return 'Unknown';
  const labels = short ? TenureLabelsShort : TenureLabels;
  // Handle v2 enum
  if (labels[val]) return labels[val];
  // Handle v1 DB value
  if (['Freehold', '99-year', '999-year'].includes(val)) {
    return short
      ? { Freehold: 'FH', '99-year': '99yr', '999-year': '999yr' }[val]
      : val;
  }
  return val;
};

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

/**
 * Floor level enum values.
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
 * Display labels for floor levels.
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

// =============================================================================
// RESPONSE FIELD NAMES (camelCase for v2)
// =============================================================================

/**
 * Transaction field names in API v2 responses.
 * Use these constants instead of hardcoding field names.
 */
export const TxnField = {
  ID: 'id',
  PROJECT_NAME: 'projectName',
  DISTRICT: 'district',
  BEDROOM_COUNT: 'bedroomCount',
  TRANSACTION_DATE: 'transactionDate',
  PRICE: 'price',
  AREA_SQFT: 'areaSqft',
  PSF: 'psf',
  SALE_TYPE: 'saleType',
  TENURE: 'tenure',
  FLOOR_LEVEL: 'floorLevel',
  REMAINING_LEASE: 'remainingLease',
  MARKET_SEGMENT: 'marketSegment',
  STREET_NAME: 'streetName',
  FLOOR_RANGE: 'floorRange',
};

/**
 * Mapping from v2 camelCase to v1 snake_case field names.
 * Used for backwards compatibility during migration.
 */
const V1_FIELD_MAP = {
  projectName: 'project_name',
  bedroomCount: 'bedroom_count',
  transactionDate: 'transaction_date',
  areaSqft: 'area_sqft',
  saleType: 'sale_type',
  floorLevel: 'floor_level',
  remainingLease: 'remaining_lease',
  marketSegment: 'market_segment',
  streetName: 'street_name',
  floorRange: 'floor_range',
};

/**
 * Get field value from transaction object, handling both v1 and v2 formats.
 *
 * @param {Object} txn - Transaction object from API
 * @param {string} field - Field name (use TxnField constants)
 * @returns {*} Field value or undefined
 *
 * @example
 * const projectName = getTxnField(txn, TxnField.PROJECT_NAME);
 */
export const getTxnField = (txn, field) => {
  if (!txn) return undefined;

  // Try v2 camelCase first
  if (txn[field] !== undefined) {
    return txn[field];
  }

  // Fallback to v1 snake_case
  const v1Field = V1_FIELD_MAP[field];
  if (v1Field && txn[v1Field] !== undefined) {
    return txn[v1Field];
  }

  // Field doesn't change between versions (e.g., 'id', 'district')
  return txn[field];
};

// =============================================================================
// API PARAMETER HELPERS
// =============================================================================

/**
 * Convert filter values to API v2 parameter format.
 * Use this when building API request params.
 *
 * @param {Object} filters - Filter state from context
 * @returns {Object} API parameters in v2 format
 */
export const toApiParams = (filters) => {
  const params = {};

  if (filters.saleType) {
    // Send v2 enum format
    params.saleType = filters.saleType;
  }

  if (filters.tenure) {
    params.tenure = filters.tenure;
  }

  if (filters.segment) {
    // v2 uses lowercase
    params.region = filters.segment.toLowerCase();
  }

  return params;
};

/**
 * Request v2 schema from API (clean output without deprecated fields).
 * Add ?schema=v2 to get only camelCase fields and enum values.
 */
export const V2_SCHEMA_PARAM = { schema: 'v2' };
