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
 * PRIORITY ORDER (like Power BI):
 * 1. Sidebar filters (slicers) - HIGHEST priority, never overwritten
 * 2. Cross-filters - only apply if sidebar filter not set
 * 3. Highlights - only apply to date if sidebar date not set
 *
 * @param {Object} filters - Sidebar filters
 * @param {Object} crossFilter - Cross-filter state
 * @param {Object} highlight - Highlight state
 * @param {Object} breadcrumbs - Breadcrumb state
 * @param {Object} drillPath - Drill path state
 * @returns {Object} Combined active filters
 */
export function deriveActiveFilters(filters, crossFilter, highlight, breadcrumbs, drillPath) {
  const combined = { ...filters };

  // Apply cross-filter ONLY if corresponding sidebar filter is NOT set
  if (crossFilter.dimension && crossFilter.value) {
    switch (crossFilter.dimension) {
      case 'district':
        if (filters.districts.length === 0) {
          combined.districts = [crossFilter.value];
        }
        break;
      case 'bedroom':
        if (filters.bedroomTypes.length === 0) {
          combined.bedroomTypes = [parseInt(crossFilter.value)];
        }
        break;
      case 'sale_type':
        if (!filters.saleType) {
          combined.saleType = crossFilter.value;
        }
        break;
      case 'region':
        if (filters.segments.length === 0) {
          combined.segments = [crossFilter.value];
        }
        break;
    }
  }

  // Apply highlight filter ONLY if sidebar date range is NOT set
  if (highlight.dimension && highlight.value) {
    const sidebarDateSet = filters.dateRange.start || filters.dateRange.end;

    if (!sidebarDateSet) {
      if (highlight.dimension === 'month') {
        const [year, month] = highlight.value.split('-');
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        combined.dateRange = {
          start: `${highlight.value}-01`,
          end: `${highlight.value}-${String(lastDay).padStart(2, '0')}`,
        };
      } else if (highlight.dimension === 'quarter') {
        const [year, q] = highlight.value.split('-Q');
        const quarterStartMonth = (parseInt(q) - 1) * 3 + 1;
        const quarterEndMonth = quarterStartMonth + 2;
        const lastDay = new Date(parseInt(year), quarterEndMonth, 0).getDate();
        combined.dateRange = {
          start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
          end: `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      } else if (highlight.dimension === 'year') {
        combined.dateRange = {
          start: `${highlight.value}-01-01`,
          end: `${highlight.value}-12-31`,
        };
      }
    }
  }

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
export function countActiveFilters(filters, crossFilter, highlight) {
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
  if (crossFilter.value) count++;
  if (highlight.value) count++;
  return count;
}

/**
 * Generate stable filter key for chart dependencies.
 */
export function generateFilterKey(activeFilters, highlight, factFilter) {
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
    highlight: highlight.value ? { dim: highlight.dimension, val: highlight.value } : null,
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
  highlight,
  factFilter,
  additionalParams = {},
  options = {}
) {
  const params = { ...additionalParams };
  const {
    excludeHighlight = false,
    includeFactFilter = false,
    excludeLocationDrill = false,
    excludeOwnDimension = null,
  } = options;

  // Apply date range
  const highlightApplied = highlight.dimension && highlight.value;
  const dateFromHighlight = highlightApplied && !filters.dateRange.start && !filters.dateRange.end;

  if (!excludeHighlight || !dateFromHighlight) {
    if (activeFilters.dateRange.start) params.date_from = activeFilters.dateRange.start;
    if (activeFilters.dateRange.end) params.date_to = activeFilters.dateRange.end;
  } else if (excludeHighlight && dateFromHighlight) {
    if (filters.dateRange.start) params.date_from = filters.dateRange.start;
    if (filters.dateRange.end) params.date_to = filters.dateRange.end;
  }

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

  // Sale type
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
