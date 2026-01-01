/**
 * Transaction Field Helpers
 *
 * Constants and accessors for transaction API responses.
 * Canonical field names are sourced from generated backend contracts.
 */

import { getContract } from '../../generated/apiContract';
import { IS_DEV, IS_TEST } from '../../config/env';

// =============================================================================
// FIELD CONSTANTS
// =============================================================================

const priceGrowthContract = getContract('transactions/price-growth');
const priceGrowthFields = priceGrowthContract?.response_schema?.data_fields || {};

const resolveField = (fieldName) => {
  if (!priceGrowthFields[fieldName]) {
    if (IS_TEST) {
      throw new Error(`[API CONTRACT] Missing transactions field: ${fieldName}`);
    }
    if (IS_DEV) {
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
// FIELD ACCESSOR
// =============================================================================

/**
 * Get field value from transaction object.
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
  return txn[field];
};
