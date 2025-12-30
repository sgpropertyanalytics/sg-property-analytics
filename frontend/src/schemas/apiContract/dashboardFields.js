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
  AVG_PSF: 'avgPsf',
  MEDIAN_PSF: 'medianPsf',
  TOTAL_VALUE: 'totalValue',
  AVG_PRICE: 'avgPrice',

  // Location fields
  LOCATION: 'location',

  // Bedroom mix fields
  BEDROOM_COUNT: 'bedroomCount',
  SALE_TYPE: 'saleType',

  // Summary fields
  TOTAL_COUNT: 'totalCount',
  MEDIAN_PRICE: 'medianPrice',
  DATE_MIN: 'dateMin',
  DATE_MAX: 'dateMax',
  PSF_RANGE: 'psfRange',
  PRICE_RANGE: 'priceRange',
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

// =============================================================================
// FIELD ACCESSOR
// =============================================================================

/**
 * Get field value from dashboard panel data.
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
  return data[field];
};

/**
 * Get meta value from dashboard response.
 *
 * @param {Object} meta - Response meta from /api/dashboard
 * @param {string} field - Meta field name (use DashboardMetaField constants)
 * @returns {*} Meta value or undefined
 */
export const getDashboardMetaField = (meta, field) => {
  if (!meta) return undefined;
  return meta[field];
};

// =============================================================================
// PANEL NORMALIZERS
// =============================================================================

/**
 * Get summary panel data.
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
 * Get time series row data.
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
 * Get volume by location row data.
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
 * Get bedroom mix row data.
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
    // Normalized copy for downstream rendering
    isNewSale: isSaleType.newSale(saleType),
    isResale: isSaleType.resale(saleType),
    count: getDashboardField(row, DashboardField.COUNT) || 0,
  };
};

/**
 * Get sale type breakdown row data.
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
    // Normalized copy for downstream rendering
    isNewSale: isSaleType.newSale(saleType),
    isResale: isSaleType.resale(saleType),
    count: getDashboardField(row, DashboardField.COUNT) || 0,
    totalValue: getDashboardField(row, DashboardField.TOTAL_VALUE) || 0,
  };
};
