/**
 * Dashboard Field Helpers
 *
 * Constants and accessors for dashboard panel API responses.
 * Includes normalization functions for common panel types.
 */

import { getContract } from '../../generated/apiContract';
import { isSaleType } from './enums';

const dashboardContract = getContract('dashboard');
const dashboardMetaFields = dashboardContract?.response_schema?.meta_fields || {};

const resolveMetaField = (fieldName) => {
  if (!dashboardMetaFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing dashboard meta field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing dashboard meta field: ${fieldName}`);
    }
  }
  return fieldName;
};

// =============================================================================
// FIELD CONSTANTS
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

// =============================================================================
// V1 COMPATIBILITY MAPPING
// =============================================================================

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

// =============================================================================
// META FIELD CONSTANTS
// =============================================================================

/**
 * Dashboard response meta fields (from backend contracts).
 * Use these constants instead of hardcoding meta keys.
 */
export const DashboardMetaField = {
  REQUEST_ID: resolveMetaField('requestId'),
  ELAPSED_MS: resolveMetaField('elapsedMs'),
  CACHE_HIT: resolveMetaField('cacheHit'),
  FILTERS_APPLIED: resolveMetaField('filtersApplied'),
  TOTAL_RECORDS_MATCHED: resolveMetaField('totalRecordsMatched'),
  API_VERSION: resolveMetaField('apiVersion'),
  DATA_MASKED: resolveMetaField('data_masked'),
};

/**
 * Mapping from v2 camelCase to v1 snake_case for dashboard meta fields.
 */
const V1_DASHBOARD_META_FIELD_MAP = {
  elapsedMs: 'elapsed_ms',
  cacheHit: 'cache_hit',
  filtersApplied: 'filters_applied',
  totalRecordsMatched: 'total_records_matched',
};

// =============================================================================
// FIELD ACCESSOR
// =============================================================================

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
 * Get meta value from dashboard response, handling v1/v2 formats.
 *
 * @param {Object} meta - Response meta from /api/dashboard
 * @param {string} field - Meta field name (use DashboardMetaField constants)
 * @returns {*} Meta value or undefined
 */
export const getDashboardMetaField = (meta, field) => {
  if (!meta) return undefined;

  if (meta[field] !== undefined) {
    return meta[field];
  }

  const v1Field = V1_DASHBOARD_META_FIELD_MAP[field];
  if (v1Field && meta[v1Field] !== undefined) {
    return meta[v1Field];
  }

  return meta[field];
};

// =============================================================================
// PANEL NORMALIZERS
// =============================================================================

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
