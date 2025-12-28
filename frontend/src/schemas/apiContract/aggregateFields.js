/**
 * Aggregate Field Helpers
 *
 * Constants and accessors for aggregate API responses.
 * Handles v1 (snake_case) and v2 (camelCase) field formats,
 * plus unified period handling.
 */

// =============================================================================
// FIELD CONSTANTS
// =============================================================================

/**
 * Aggregate field names in API v2 responses.
 */
export const AggField = {
  // Time dimension fields (unified v2)
  PERIOD: 'period',               // Unified time bucket (canonical)
  PERIOD_GRAIN: 'periodGrain',    // Time granularity: 'year', 'quarter', 'month'
  // Legacy time fields (v1 compatibility)
  MONTH: 'month',
  QUARTER: 'quarter',
  YEAR: 'year',
  // Dimension fields
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
  // Project inventory fields (group_by=project only)
  TOTAL_UNITS: 'totalUnits',      // v1: total_units
  TOTAL_UNITS_SOURCE: 'totalUnitsSource',    // v1: total_units_source
  TOTAL_UNITS_CONFIDENCE: 'totalUnitsConfidence', // v1: total_units_confidence
};

// =============================================================================
// V1 COMPATIBILITY MAPPING
// =============================================================================

/**
 * Time bucket field names for fallback detection.
 */
const TIME_BUCKET_FIELDS = ['month', 'quarter', 'year'];

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
  // Project inventory fields
  totalUnits: 'total_units',
  totalUnitsSource: 'total_units_source',
  totalUnitsConfidence: 'total_units_confidence',
};

// =============================================================================
// FIELD ACCESSOR
// =============================================================================

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
// PERIOD HELPERS
// =============================================================================

/**
 * Get the period value from an aggregate row.
 * Handles both v2 unified 'period' field and v1 time bucket fields.
 *
 * This is the CANONICAL way to access time values from API responses.
 * DO NOT use: row[timeGrouping] ?? row.quarter ?? row.month ?? row.year
 * USE: getPeriod(row) or getPeriod(row, 'quarter')
 *
 * @param {Object} row - Aggregate row from API
 * @param {string} [expectedGrain] - Optional expected time grain for validation
 * @returns {string|number|null} Period value or null
 *
 * @example
 * // Simple usage - just get the period
 * const period = getPeriod(row);
 *
 * // With validation - warn if grain doesn't match
 * const period = getPeriod(row, 'quarter');
 */
export const getPeriod = (row, expectedGrain = null) => {
  if (!row) return null;

  // v2: Use unified 'period' field (canonical)
  if (row.period !== undefined) {
    // Validate grain if provided
    if (expectedGrain && row.periodGrain && row.periodGrain !== expectedGrain) {
      console.warn(
        `Period grain mismatch: expected '${expectedGrain}' but got '${row.periodGrain}'`,
        row
      );
    }
    return row.period;
  }

  // v1: Fallback to legacy time bucket fields
  for (const field of TIME_BUCKET_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) {
      return row[field];
    }
  }

  return null;
};

/**
 * Get the period grain (time granularity) from an aggregate row.
 *
 * @param {Object} row - Aggregate row from API
 * @returns {'year'|'quarter'|'month'|null} Period grain or null
 */
export const getPeriodGrain = (row) => {
  if (!row) return null;

  // v2: Use explicit 'periodGrain' field
  if (row.periodGrain) {
    return row.periodGrain;
  }

  // v1: Detect from which field has data
  for (const field of TIME_BUCKET_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) {
      return field;
    }
  }

  return null;
};

/**
 * Check if an aggregate row has valid period data.
 *
 * @param {Object} row - Aggregate row from API
 * @returns {boolean} True if row has period data
 */
export const hasValidPeriod = (row) => {
  return getPeriod(row) !== null;
};
