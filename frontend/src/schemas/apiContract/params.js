/**
 * API Parameter Helpers
 *
 * Utilities for building API request parameters.
 */

// =============================================================================
// PARAMETER CONVERTERS
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
