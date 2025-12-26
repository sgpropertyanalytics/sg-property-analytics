/**
 * API Parameters Builder
 *
 * Builds query parameters from active filters for API calls.
 */

/**
 * Build API query params from active filters.
 *
 * @param {Object} activeFilters - Combined active filters
 * @param {Object} filters - Original sidebar filters
 * @param {Object} highlight - Highlight state
 * @param {Object} factFilter - Fact filter state
 * @param {Object} additionalParams - Additional params to merge
 * @param {Object} options - Build options
 * @param {boolean} options.excludeHighlight - Exclude time highlight filter
 * @param {boolean} options.includeFactFilter - Include factFilter (for Fact tables)
 * @param {boolean} options.excludeLocationDrill - Exclude location drill filters
 * @param {string} options.excludeOwnDimension - Exclude a specific dimension filter
 * @returns {Object} API query parameters
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

  // Apply date range - but skip if excludeHighlight and the date comes from highlight
  const highlightApplied = highlight.dimension && highlight.value;
  const dateFromHighlight = highlightApplied && !filters.dateRange.start && !filters.dateRange.end;

  if (!excludeHighlight || !dateFromHighlight) {
    if (activeFilters.dateRange.start) {
      params.date_from = activeFilters.dateRange.start;
    }
    if (activeFilters.dateRange.end) {
      params.date_to = activeFilters.dateRange.end;
    }
  } else if (excludeHighlight && dateFromHighlight) {
    // Use original sidebar date filters if any, ignoring highlight
    if (filters.dateRange.start) {
      params.date_from = filters.dateRange.start;
    }
    if (filters.dateRange.end) {
      params.date_to = filters.dateRange.end;
    }
  }

  // For districts: apply sidebar filter OR location drill filter (unless excluded)
  if (excludeOwnDimension !== 'district') {
    if (excludeLocationDrill) {
      if (filters.districts.length > 0) {
        params.district = filters.districts.join(',');
      }
    } else if (activeFilters.districts.length > 0) {
      params.district = activeFilters.districts.join(',');
    }
  }

  // Only filter by bedroom if user explicitly selects bedrooms
  if (excludeOwnDimension !== 'bedroom' && activeFilters.bedroomTypes.length > 0) {
    params.bedroom = activeFilters.bedroomTypes.join(',');
  }

  // For segment: apply sidebar filter OR location drill filter (unless excluded)
  if (excludeOwnDimension !== 'segment') {
    if (excludeLocationDrill) {
      if (filters.segments.length > 0) {
        params.segment = filters.segments.join(',');
      }
    } else if (activeFilters.segments.length > 0) {
      params.segment = activeFilters.segments.join(',');
    }
  }

  // Skip if this is an anchor chart for sale_type dimension
  if (excludeOwnDimension !== 'sale_type' && activeFilters.saleType) {
    params.sale_type = activeFilters.saleType;
  }

  if (activeFilters.psfRange.min !== null) {
    params.psf_min = activeFilters.psfRange.min;
  }
  if (activeFilters.psfRange.max !== null) {
    params.psf_max = activeFilters.psfRange.max;
  }
  if (activeFilters.sizeRange.min !== null) {
    params.size_min = activeFilters.sizeRange.min;
  }
  if (activeFilters.sizeRange.max !== null) {
    params.size_max = activeFilters.sizeRange.max;
  }

  // Price range from factFilter - only include for Fact tables
  if (includeFactFilter) {
    if (factFilter.priceRange?.min !== null) {
      params.price_min = factFilter.priceRange.min;
    }
    if (factFilter.priceRange?.max !== null) {
      params.price_max = factFilter.priceRange.max;
    }
  }

  if (activeFilters.tenure) {
    params.tenure = activeFilters.tenure;
  }
  if (activeFilters.propertyAge?.min !== null) {
    params.property_age_min = activeFilters.propertyAge.min;
  }
  if (activeFilters.propertyAge?.max !== null) {
    params.property_age_max = activeFilters.propertyAge.max;
  }
  if (activeFilters.project) {
    params.project = activeFilters.project;
  }
  if (activeFilters.propertyAgeBucket) {
    params.propertyAgeBucket = activeFilters.propertyAgeBucket;
  }

  return params;
}
