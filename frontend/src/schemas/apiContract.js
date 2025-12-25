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
 * Helpers to check tenure regardless of v1 (DB) or v2 (API) format.
 * Use these during the migration period when values may contain either format.
 */
export const isTenure = {
  freehold: (val) => val === Tenure.FREEHOLD || val === 'Freehold',
  leasehold99: (val) => val === Tenure.LEASEHOLD_99 || val === '99-year',
  leasehold999: (val) => val === Tenure.LEASEHOLD_999 || val === '999-year',
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

// =============================================================================
// AGGREGATE RESPONSE FIELD HELPERS
// =============================================================================

/**
 * Aggregate field names in API v2 responses.
 */
export const AggField = {
  // Dimension fields
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
  DISTRICT: 'district',
  BEDROOM_COUNT: 'bedroomCount',  // v1: bedroom
  SALE_TYPE: 'saleType',          // v1: sale_type
  PROJECT: 'project',
  REGION: 'region',
  FLOOR_LEVEL: 'floorLevel',      // v1: floor_level
  // Metric fields
  COUNT: 'count',
  AVG_PSF: 'avgPsf',              // v1: avg_psf
  MEDIAN_PSF: 'medianPsf',        // v1: median_psf
  TOTAL_VALUE: 'totalValue',      // v1: total_value
  AVG_PRICE: 'avgPrice',          // v1: avg_price
  MEDIAN_PRICE: 'medianPrice',    // v1: median_price
};

/**
 * Mapping from v2 camelCase to v1 snake_case for aggregate fields.
 */
const V1_AGG_FIELD_MAP = {
  bedroomCount: 'bedroom',
  saleType: 'sale_type',
  floorLevel: 'floor_level',
  avgPsf: 'avg_psf',
  medianPsf: 'median_psf',
  totalValue: 'total_value',
  avgPrice: 'avg_price',
  medianPrice: 'median_price',
};

/**
 * Get field value from aggregate row, handling both v1 and v2 formats.
 *
 * @param {Object} row - Aggregate row from API
 * @param {string} field - Field name (use AggField constants)
 * @returns {*} Field value or undefined
 *
 * @example
 * const saleType = getAggField(row, AggField.SALE_TYPE);
 * const count = getAggField(row, AggField.COUNT);
 */
export const getAggField = (row, field) => {
  if (!row) return undefined;

  // Try v2 camelCase first
  if (row[field] !== undefined) {
    return row[field];
  }

  // Fallback to v1 snake_case
  const v1Field = V1_AGG_FIELD_MAP[field];
  if (v1Field && row[v1Field] !== undefined) {
    return row[v1Field];
  }

  // Field doesn't change between versions (e.g., 'count', 'month', 'quarter')
  return row[field];
};

// =============================================================================
// FILTER OPTIONS NORMALIZATION
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

/**
 * Check if a value is already in {value, label} format.
 */
const isValueLabelFormat = (item) =>
  item && typeof item === 'object' && 'value' in item && 'label' in item;

/**
 * Normalize a single option to {value, label} format.
 * Handles both v1 (raw value) and v2 ({value, label}) formats.
 *
 * @param {any} item - Raw value or {value, label} object
 * @param {Function} valueTransform - Optional transform for value
 * @param {Function} labelTransform - Optional transform for label
 * @returns {{value: any, label: string}}
 */
const normalizeOption = (item, valueTransform = null, labelTransform = null) => {
  if (isValueLabelFormat(item)) {
    // Already v2 format
    return item;
  }
  // v1 format: raw value, create {value, label}
  const value = valueTransform ? valueTransform(item) : item;
  const label = labelTransform ? labelTransform(item) : String(item);
  return { value, label };
};

/**
 * Normalize sale types to {value, label} format.
 * v1: ['New Sale', 'Resale'] → v2 format with enums
 * v2: [{value: 'new_sale', label: 'New Sale'}] → pass through
 */
const normalizeSaleTypes = (saleTypes) => {
  if (!saleTypes || !Array.isArray(saleTypes)) return [];

  return saleTypes.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: DB string
    const dbToEnum = {
      'New Sale': SaleType.NEW_SALE,
      'Resale': SaleType.RESALE,
      'Sub Sale': SaleType.SUB_SALE,
    };
    return {
      value: dbToEnum[item] || item,
      label: item,
    };
  });
};

/**
 * Normalize tenures to {value, label} format.
 * v1: ['Freehold', '99-year'] → v2 format with enums
 * v2: [{value: 'freehold', label: 'Freehold'}] → pass through
 */
const normalizeTenures = (tenures) => {
  if (!tenures || !Array.isArray(tenures)) return [];

  return tenures.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: DB string
    const dbToEnum = {
      'Freehold': Tenure.FREEHOLD,
      '99-year': Tenure.LEASEHOLD_99,
      '999-year': Tenure.LEASEHOLD_999,
    };
    const shortLabels = {
      'Freehold': 'FH',
      '99-year': '99yr',
      '999-year': '999yr',
    };
    return {
      value: dbToEnum[item] || item,
      label: shortLabels[item] || item,
      fullLabel: item, // Keep original for tooltips
    };
  });
};

/**
 * Normalize regions to {value, label} format.
 * v1: {CCR: [...], RCR: [...]} → [{value: 'ccr', label: 'CCR'}]
 * v2: [{value: 'ccr', label: 'CCR'}] → pass through
 */
const normalizeRegions = (regions) => {
  // Check if already v2 array format
  if (Array.isArray(regions) && regions.length > 0 && isValueLabelFormat(regions[0])) {
    return regions;
  }

  // v1 format: object {CCR: [...], RCR: [...], OCR: [...]}
  if (regions && typeof regions === 'object' && !Array.isArray(regions)) {
    return ['CCR', 'RCR', 'OCR']
      .filter((key) => key in regions)
      .map((key) => ({
        value: key.toLowerCase(),
        label: key,
      }));
  }

  return [];
};

/**
 * Normalize districts to {value, label} format.
 * v1: ['D01', 'D02'] → [{value: 'D01', label: 'D01'}]
 * v2: [{value: 'D01', label: 'D01'}] → pass through
 */
const normalizeDistricts = (districts) => {
  if (!districts || !Array.isArray(districts)) return [];

  return districts.map((item) => {
    if (isValueLabelFormat(item)) return item;
    return { value: item, label: item };
  });
};

/**
 * Normalize bedrooms to {value, label} format.
 * v1: [1, 2, 3, 4, 5] → [{value: 1, label: '1'}, ..., {value: '5_plus', label: '5+'}]
 * v2: [{value: 1, label: '1'}, ...] → pass through
 */
const normalizeBedrooms = (bedrooms) => {
  if (!bedrooms || !Array.isArray(bedrooms)) return [];

  return bedrooms.map((item) => {
    if (isValueLabelFormat(item)) return item;

    // v1 format: integer
    if (item >= 5) {
      return { value: Bedroom.FIVE_PLUS, label: '5+' };
    }
    return { value: item, label: String(item) };
  });
};

// =============================================================================
// DASHBOARD PANEL FIELD HELPERS
// =============================================================================

/**
 * Dashboard panel field names in API v2 responses.
 * Use these constants instead of hardcoding field names.
 */
export const DashboardField = {
  // Time series / aggregate fields
  PERIOD: 'period',
  COUNT: 'count',
  AVG_PSF: 'avgPsf',              // v1: avg_psf
  MEDIAN_PSF: 'medianPsf',        // v1: median_psf
  TOTAL_VALUE: 'totalValue',      // v1: total_value
  AVG_PRICE: 'avgPrice',          // v1: avg_price

  // Location fields
  LOCATION: 'location',

  // Bedroom mix fields
  BEDROOM_COUNT: 'bedroomCount',  // v1: bedroom
  SALE_TYPE: 'saleType',          // v1: sale_type

  // Summary fields
  TOTAL_COUNT: 'totalCount',      // v1: total_count
  MEDIAN_PRICE: 'medianPrice',    // v1: median_price
  DATE_MIN: 'dateMin',            // v1: date_min
  DATE_MAX: 'dateMax',            // v1: date_max
  PSF_RANGE: 'psfRange',          // v1: psf_range
  PRICE_RANGE: 'priceRange',      // v1: price_range
};

/**
 * Mapping from v2 camelCase to v1 snake_case for dashboard fields.
 */
const V1_DASHBOARD_FIELD_MAP = {
  avgPsf: 'avg_psf',
  medianPsf: 'median_psf',
  totalValue: 'total_value',
  avgPrice: 'avg_price',
  bedroomCount: 'bedroom',
  saleType: 'sale_type',
  totalCount: 'total_count',
  medianPrice: 'median_price',
  dateMin: 'date_min',
  dateMax: 'date_max',
  psfRange: 'psf_range',
  priceRange: 'price_range',
};

/**
 * Get field value from dashboard panel data, handling both v1 and v2 formats.
 *
 * @param {Object} data - Panel data from /api/dashboard response
 * @param {string} field - Field name (use DashboardField constants)
 * @returns {*} Field value or undefined
 *
 * @example
 * const avgPsf = getDashboardField(summary, DashboardField.AVG_PSF);
 * const saleType = getDashboardField(row, DashboardField.SALE_TYPE);
 */
export const getDashboardField = (data, field) => {
  if (!data) return undefined;

  // Try v2 camelCase first
  if (data[field] !== undefined) {
    return data[field];
  }

  // Fallback to v1 snake_case
  const v1Field = V1_DASHBOARD_FIELD_MAP[field];
  if (v1Field && data[v1Field] !== undefined) {
    return data[v1Field];
  }

  // Field doesn't change between versions (e.g., 'period', 'count', 'location')
  return data[field];
};

/**
 * Get summary panel data with v1/v2 compatibility.
 *
 * @param {Object} summary - Summary panel from dashboard response
 * @returns {Object} Normalized summary with consistent field names
 */
export const normalizeSummaryPanel = (summary) => {
  if (!summary) return null;
  return {
    totalCount: getDashboardField(summary, DashboardField.TOTAL_COUNT) || 0,
    avgPsf: getDashboardField(summary, DashboardField.AVG_PSF),
    medianPsf: getDashboardField(summary, DashboardField.MEDIAN_PSF),
    avgPrice: getDashboardField(summary, DashboardField.AVG_PRICE),
    medianPrice: getDashboardField(summary, DashboardField.MEDIAN_PRICE),
    totalValue: getDashboardField(summary, DashboardField.TOTAL_VALUE) || 0,
    dateMin: getDashboardField(summary, DashboardField.DATE_MIN),
    dateMax: getDashboardField(summary, DashboardField.DATE_MAX),
    psfRange: getDashboardField(summary, DashboardField.PSF_RANGE),
    priceRange: getDashboardField(summary, DashboardField.PRICE_RANGE),
  };
};

/**
 * Get time series row data with v1/v2 compatibility.
 *
 * @param {Object} row - Time series row from dashboard response
 * @returns {Object} Normalized row with consistent field names
 */
export const normalizeTimeSeriesRow = (row) => {
  if (!row) return null;
  return {
    period: row.period,
    count: getDashboardField(row, DashboardField.COUNT) || 0,
    avgPsf: getDashboardField(row, DashboardField.AVG_PSF),
    medianPsf: getDashboardField(row, DashboardField.MEDIAN_PSF),
    totalValue: getDashboardField(row, DashboardField.TOTAL_VALUE) || 0,
    avgPrice: getDashboardField(row, DashboardField.AVG_PRICE),
  };
};

/**
 * Get volume by location row data with v1/v2 compatibility.
 *
 * @param {Object} row - Volume row from dashboard response
 * @returns {Object} Normalized row with consistent field names
 */
export const normalizeLocationRow = (row) => {
  if (!row) return null;
  return {
    location: row.location,
    count: getDashboardField(row, DashboardField.COUNT) || 0,
    totalValue: getDashboardField(row, DashboardField.TOTAL_VALUE) || 0,
    avgPsf: getDashboardField(row, DashboardField.AVG_PSF),
  };
};

/**
 * Get bedroom mix row data with v1/v2 compatibility.
 *
 * @param {Object} row - Bedroom mix row from dashboard response
 * @returns {Object} Normalized row with consistent field names
 */
export const normalizeBedroomMixRow = (row) => {
  if (!row) return null;
  const saleType = getDashboardField(row, DashboardField.SALE_TYPE);
  return {
    period: row.period,
    bedroomCount: getDashboardField(row, DashboardField.BEDROOM_COUNT),
    saleType: saleType,
    // Helper for v1/v2 compatibility
    isNewSale: isSaleType.newSale(saleType),
    isResale: isSaleType.resale(saleType),
    count: getDashboardField(row, DashboardField.COUNT) || 0,
  };
};

/**
 * Get sale type breakdown row data with v1/v2 compatibility.
 *
 * @param {Object} row - Sale type row from dashboard response
 * @returns {Object} Normalized row with consistent field names
 */
export const normalizeSaleTypeRow = (row) => {
  if (!row) return null;
  const saleType = getDashboardField(row, DashboardField.SALE_TYPE);
  return {
    period: row.period,
    saleType: saleType,
    // Helper for v1/v2 compatibility
    isNewSale: isSaleType.newSale(saleType),
    isResale: isSaleType.resale(saleType),
    count: getDashboardField(row, DashboardField.COUNT) || 0,
    totalValue: getDashboardField(row, DashboardField.TOTAL_VALUE) || 0,
  };
};

// =============================================================================
// FILTER OPTIONS NORMALIZATION
// =============================================================================

/**
 * Normalize filter options from API response.
 * Handles both v1 (raw values) and v2 ({value, label}) formats.
 *
 * @param {Object} apiResponse - Raw API response from /api/filter-options
 * @returns {Object} Normalized filter options with {value, label} arrays
 *
 * @example
 * const normalized = normalizeFilterOptions(apiResponse);
 * // normalized.saleTypes = [{value: 'new_sale', label: 'New Sale'}, ...]
 * // normalized.regions = [{value: 'ccr', label: 'CCR'}, ...]
 */
export const normalizeFilterOptions = (apiResponse) => {
  if (!apiResponse) return null;

  // Prefer v2 fields (camelCase), fallback to v1 (snake_case)
  const saleTypesRaw = apiResponse.saleTypes || apiResponse.sale_types || [];
  const tenuresRaw = apiResponse.tenures || [];
  const regionsRaw = apiResponse.regions || apiResponse.regions_legacy || {};
  const districtsRaw = apiResponse.districts || [];
  const bedroomsRaw = apiResponse.bedrooms || [];
  const marketSegmentsRaw = apiResponse.marketSegments || regionsRaw;

  // Date/PSF/Size ranges (same structure in v1 and v2)
  const dateRange = apiResponse.dateRange || apiResponse.date_range || { min: null, max: null };
  const psfRange = apiResponse.psfRange || apiResponse.psf_range || { min: null, max: null };
  const sizeRange = apiResponse.sizeRange || apiResponse.size_range || { min: null, max: null };

  return {
    saleTypes: normalizeSaleTypes(saleTypesRaw),
    tenures: normalizeTenures(tenuresRaw),
    regions: normalizeRegions(regionsRaw),
    districts: normalizeDistricts(districtsRaw),
    bedrooms: normalizeBedrooms(bedroomsRaw),
    marketSegments: normalizeRegions(marketSegmentsRaw),
    dateRange,
    psfRange,
    sizeRange,
    // Keep raw districts list for legacy compatibility
    districtsRaw: Array.isArray(districtsRaw)
      ? districtsRaw.map((d) => (isValueLabelFormat(d) ? d.value : d))
      : [],
    // Keep raw regions dict for legacy compatibility
    regionsLegacy: apiResponse.regions_legacy || (typeof regionsRaw === 'object' && !Array.isArray(regionsRaw) ? regionsRaw : null),
    // API contract version
    apiContractVersion: apiResponse.apiContractVersion || 'v1',
  };
};
