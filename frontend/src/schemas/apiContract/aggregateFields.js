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
