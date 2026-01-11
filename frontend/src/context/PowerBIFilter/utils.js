/**
 * PowerBI Filter Utilities
 *
 * Pure functions for filter derivation and API parameter building.
 */

// =============================================================================
// ACTIVE FILTERS DERIVATION
// =============================================================================

/**
 * Derive active filters from sidebar filters.
 * Returns a copy of filters for consistency with the store API.
 *
 * @param {Object} filters - Sidebar filters
 * @returns {Object} Active filters
 */
export function deriveActiveFilters(filters) {
  return { ...filters };
}

/**
 * Count active filters for badge display.
 * @param {Object} filters - Filter state object (with null guards)
 */
export function countActiveFilters(filters) {
  if (!filters) return 0;

  let count = 0;
  // Count time filter if: custom date range set OR preset is not default (Y1)
  const tf = filters.timeFilter;
  if (tf) {
    if (tf.type === 'custom' && (tf.start || tf.end)) {
      count++;
    } else if (tf.type === 'preset' && tf.value && tf.value !== 'Y1') {
      count++;
    }
  }
  if (filters.districts?.length > 0) count++;
  if (filters.bedroomTypes?.length > 0) count++;
  if (filters.segments?.length > 0) count++;
  if (filters.saleType) count++;
  if (filters.psfRange?.min !== null || filters.psfRange?.max !== null) count++;
  if (filters.sizeRange?.min !== null || filters.sizeRange?.max !== null) count++;
  if (filters.tenure) count++;
  if (filters.propertyAge?.min !== null || filters.propertyAge?.max !== null) count++;
  if (filters.propertyAgeBucket) count++;
  if (filters.project) count++;
  return count;
}
