/**
 * PowerBI Filter Utilities
 *
 * Pure functions for filter derivation and API parameter building.
 */

// =============================================================================
// ACTIVE FILTERS DERIVATION
// =============================================================================

/**
 * Derive active filters from all filter sources.
 *
 * @param {Object} filters - Sidebar filters
 * @param {Object} breadcrumbs - Breadcrumb state
 * @param {Object} drillPath - Drill path state
 * @returns {Object} Combined active filters
 */
export function deriveActiveFilters(filters, breadcrumbs, drillPath) {
  const combined = { ...filters };

  // Apply time breadcrumb filters (overrides timeFilter with custom date range)
  if (breadcrumbs.time.length > 0) {
    const lastTime = breadcrumbs.time[breadcrumbs.time.length - 1];
    if (lastTime && lastTime.value) {
      if (drillPath.time === 'quarter') {
        const yearStr = String(breadcrumbs.time[0].value);
        combined.timeFilter = {
          type: 'custom',
          start: `${yearStr}-01-01`,
          end: `${yearStr}-12-31`,
        };
      } else if (drillPath.time === 'month') {
        const lastValue = String(lastTime.value);
        let year;
        if (breadcrumbs.time.length >= 2) {
          year = String(breadcrumbs.time[0].value);
        } else {
          const yearMatch = lastValue.match(/^(\d{4})/);
          year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
        }
        const qMatch = lastValue.match(/Q(\d)/);
        const q = qMatch ? parseInt(qMatch[1]) : 1;
        const quarterStartMonth = (q - 1) * 3 + 1;
        const quarterEndMonth = quarterStartMonth + 2;
        const lastDay = new Date(parseInt(year), quarterEndMonth, 0).getDate();
        combined.timeFilter = {
          type: 'custom',
          start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
          end: `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      }
    }
  }

  // Apply location breadcrumb filters
  if (breadcrumbs.location.length > 0 && drillPath.location === 'district') {
    const regionBreadcrumb = breadcrumbs.location[0];
    if (regionBreadcrumb?.value) {
      combined.segments = [String(regionBreadcrumb.value)];
    }
  }

  return combined;
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
