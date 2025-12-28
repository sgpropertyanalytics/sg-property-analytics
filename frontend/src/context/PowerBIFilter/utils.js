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

  // Apply time breadcrumb filters
  if (breadcrumbs.time.length > 0) {
    const lastTime = breadcrumbs.time[breadcrumbs.time.length - 1];
    if (lastTime && lastTime.value) {
      if (drillPath.time === 'quarter') {
        const yearStr = String(breadcrumbs.time[0].value);
        combined.dateRange = { start: `${yearStr}-01-01`, end: `${yearStr}-12-31` };
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
        combined.dateRange = {
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
 */
export function countActiveFilters(filters) {
  let count = 0;
  if (filters.dateRange.start || filters.dateRange.end) count++;
  if (filters.districts.length > 0) count++;
  if (filters.bedroomTypes.length > 0) count++;
  if (filters.segments.length > 0) count++;
  if (filters.saleType) count++;
  if (filters.psfRange.min !== null || filters.psfRange.max !== null) count++;
  if (filters.sizeRange.min !== null || filters.sizeRange.max !== null) count++;
  if (filters.tenure) count++;
  if (filters.propertyAge.min !== null || filters.propertyAge.max !== null) count++;
  if (filters.propertyAgeBucket) count++;
  if (filters.project) count++;
  return count;
}

/**
 * Generate stable filter key for chart dependencies.
 */
export function generateFilterKey(activeFilters, factFilter) {
  return JSON.stringify({
    dateRange: activeFilters.dateRange,
    districts: activeFilters.districts,
    bedroomTypes: activeFilters.bedroomTypes,
    segments: activeFilters.segments,
    saleType: activeFilters.saleType,
    psfRange: activeFilters.psfRange,
    sizeRange: activeFilters.sizeRange,
    tenure: activeFilters.tenure,
    propertyAge: activeFilters.propertyAge,
    propertyAgeBucket: activeFilters.propertyAgeBucket,
    project: activeFilters.project,
    factFilter: factFilter.priceRange,
  });
}

// =============================================================================
// API PARAMETERS BUILDER
// =============================================================================

/**
 * Build API query params from active filters.
 */
export function buildApiParamsFromState(
  activeFilters,
  filters,
  factFilter,
  additionalParams = {},
  options = {}
) {
  const params = { ...additionalParams };
  const {
    includeFactFilter = false,
    excludeLocationDrill = false,
    excludeOwnDimension = null,
  } = options;

  // Apply date range
  if (activeFilters.dateRange.start) params.date_from = activeFilters.dateRange.start;
  if (activeFilters.dateRange.end) params.date_to = activeFilters.dateRange.end;

  // Districts
  if (excludeOwnDimension !== 'district') {
    if (excludeLocationDrill) {
      if (filters.districts.length > 0) params.district = filters.districts.join(',');
    } else if (activeFilters.districts.length > 0) {
      params.district = activeFilters.districts.join(',');
    }
  }

  // Bedrooms
  if (excludeOwnDimension !== 'bedroom' && activeFilters.bedroomTypes.length > 0) {
    params.bedroom = activeFilters.bedroomTypes.join(',');
  }

  // Segments
  if (excludeOwnDimension !== 'segment') {
    if (excludeLocationDrill) {
      if (filters.segments.length > 0) params.segment = filters.segments.join(',');
    } else if (activeFilters.segments.length > 0) {
      params.segment = activeFilters.segments.join(',');
    }
  }

  // Sale type - pass through from filters (page/chart layer enforces business rules)
  // See CLAUDE.md "Business Logic Enforcement" for why this is NOT hardcoded here
  if (excludeOwnDimension !== 'sale_type' && activeFilters.saleType) {
    params.sale_type = activeFilters.saleType;
  }

  // Ranges
  if (activeFilters.psfRange.min !== null) params.psf_min = activeFilters.psfRange.min;
  if (activeFilters.psfRange.max !== null) params.psf_max = activeFilters.psfRange.max;
  if (activeFilters.sizeRange.min !== null) params.size_min = activeFilters.sizeRange.min;
  if (activeFilters.sizeRange.max !== null) params.size_max = activeFilters.sizeRange.max;

  // Fact filter (for transaction tables)
  if (includeFactFilter) {
    if (factFilter.priceRange?.min !== null) params.price_min = factFilter.priceRange.min;
    if (factFilter.priceRange?.max !== null) params.price_max = factFilter.priceRange.max;
  }

  // Other filters
  if (activeFilters.tenure) params.tenure = activeFilters.tenure;
  if (activeFilters.propertyAge?.min !== null) params.property_age_min = activeFilters.propertyAge.min;
  if (activeFilters.propertyAge?.max !== null) params.property_age_max = activeFilters.propertyAge.max;
  if (activeFilters.project) params.project = activeFilters.project;
  if (activeFilters.propertyAgeBucket) params.propertyAgeBucket = activeFilters.propertyAgeBucket;

  return params;
}
