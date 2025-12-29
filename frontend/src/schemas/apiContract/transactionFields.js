/**
 * Transaction Field Helpers
 *
 * Constants and accessors for transaction API responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';

// =============================================================================
// FIELD CONSTANTS
// =============================================================================

const priceGrowthContract = getContract('transactions/price-growth');
const priceGrowthFields = priceGrowthContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!priceGrowthFields[fieldName]) {
    if (import.meta.env.MODE === 'test') {
      throw new Error(`[API CONTRACT] Missing transactions field: ${fieldName}`);
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[API CONTRACT] Missing transactions field: ${fieldName}`);
    }
  }
  return fieldName;
};

/**
 * Transaction field names in API v2 responses.
 * Use these constants instead of hardcoding field names.
 */
export const TxnField = {
  ID: resolveField('transactionId'),
  PROJECT: resolveField('project'),
  BEDROOM_COUNT: resolveField('bedroomCount'),
  FLOOR_LEVEL: resolveField('floorLevel'),
  TRANSACTION_DATE: resolveField('transactionDate'),
  PRICE: resolveField('price'),
  PSF: resolveField('psf'),
  CUMULATIVE_GROWTH_PCT: resolveField('cumulativeGrowthPct'),
  INCREMENTAL_GROWTH_PCT: resolveField('incrementalGrowthPct'),
  DAYS_SINCE_PREVIOUS: resolveField('daysSincePrevious'),
  ANNUALIZED_GROWTH_PCT: resolveField('annualizedGrowthPct'),
};

// =============================================================================
// V1 COMPATIBILITY MAPPING
// =============================================================================

/**
 * Mapping from v2 camelCase to v1 snake_case field names.
 * Used for backwards compatibility during migration.
 */
const V1_FIELD_MAP = {
  transactionId: 'id',
  project: 'project_name',
  bedroomCount: 'bedroom_count',
  floorLevel: 'floor_level',
  transactionDate: 'transaction_date',
  price: 'price',
  psf: 'psf',
  cumulativeGrowthPct: 'cumulative_growth_pct',
  incrementalGrowthPct: 'incremental_growth_pct',
  daysSincePrevious: 'days_since_prev',
  annualizedGrowthPct: 'annualized_growth_pct',
};

// =============================================================================
// FIELD ACCESSOR
// =============================================================================

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
