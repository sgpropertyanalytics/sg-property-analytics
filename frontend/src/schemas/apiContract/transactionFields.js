/**
 * Transaction Field Helpers
 *
 * Constants and accessors for transaction API responses.
 * Handles v1 (snake_case) and v2 (camelCase) field formats.
 */

// =============================================================================
// FIELD CONSTANTS
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

// =============================================================================
// V1 COMPATIBILITY MAPPING
// =============================================================================

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
