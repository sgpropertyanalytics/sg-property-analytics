/**
 * Aggregate Field Helpers
 *
 * Constants and accessors for aggregate API responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

// =============================================================================
// FIELD CONSTANTS
// =============================================================================

const aggregateContract = getContract('aggregate');
const aggregateFields = aggregateContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!aggregateFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing aggregate field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing aggregate field: ${fieldName}`);
    }
  }
  return fieldName;
};

/**
 * Aggregate field names in API v2 responses.
 */
export const AggField = {
  // Time dimension fields (unified v2)
  PERIOD: resolveField('period'),               // Unified time bucket (canonical)
  PERIOD_GRAIN: resolveField('periodGrain'),    // Time granularity: 'year', 'quarter', 'month'
  // Dimension fields
  DISTRICT: resolveField('district'),
  BEDROOM_COUNT: resolveField('bedroomCount'),
  SALE_TYPE: resolveField('saleType'),
  PROJECT: resolveField('project'),
  REGION: resolveField('region'),
  FLOOR_LEVEL: resolveField('floorLevel'),
  // Metric fields
  COUNT: resolveField('count'),
  AVG_PSF: resolveField('avgPsf'),
  MEDIAN_PSF: resolveField('medianPsf'),
  TOTAL_VALUE: resolveField('totalValue'),
  AVG_PRICE: resolveField('avgPrice'),
  MEDIAN_PRICE: resolveField('medianPrice'),
  // Project inventory fields (group_by=project only)
  TOTAL_UNITS: resolveField('totalUnits'),
  TOTAL_UNITS_SOURCE: resolveField('totalUnitsSource'),
  TOTAL_UNITS_CONFIDENCE: resolveField('totalUnitsConfidence'),
  TOP_YEAR: resolveField('topYear'),
  // Lease info and age band (group_by=project only)
  LEASE_START_YEAR: resolveField('leaseStartYear'),
  PROPERTY_AGE_YEARS: resolveField('propertyAgeYears'),
  AGE_BAND: resolveField('ageBand'),
};

// =============================================================================
// FIELD ACCESSOR
// =============================================================================

/**
 * Get field value from aggregate row.
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
  return row[field];
};

// =============================================================================
// PERIOD HELPERS
// =============================================================================

/**
 * Get the period value from an aggregate row.
 * This is the CANONICAL way to access time values from API responses.
 *
 * DESIGN: Transforms should trust the data's own periodGrain, not an expected
 * grain from the UI. This avoids false warnings when keepPreviousData shows
 * stale data during refresh. Grain validation should happen at fetch-site
 * when status === 'success'.
 *
 * @param {Object} row - Aggregate row from API
 * @returns {string|number|null} Period value or null
 *
 * @example
 * const period = getPeriod(row);
 * const grain = getPeriodGrain(row); // Use data's own grain
 */
export const getPeriod = (row) => {
  if (!row) return null;
  return row.period !== undefined ? row.period : null;
};

/**
 * Get the period grain (time granularity) from an aggregate row.
 *
 * @param {Object} row - Aggregate row from API
 * @returns {'year'|'quarter'|'month'|null} Period grain or null
 */
export const getPeriodGrain = (row) => {
  if (!row) return null;

  if (row.periodGrain) {
    return row.periodGrain;
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
