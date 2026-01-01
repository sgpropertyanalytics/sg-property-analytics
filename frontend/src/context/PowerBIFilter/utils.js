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
    datePreset: activeFilters.datePreset,
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

const V2_PARAM_KEY_MAP = {
  group_by: 'groupBy',
  sale_type: 'saleType',
  date_from: 'dateFrom',
  date_to: 'dateTo',
  psf_min: 'psfMin',
  psf_max: 'psfMax',
  size_min: 'sizeMin',
  size_max: 'sizeMax',
  price_min: 'priceMin',
  price_max: 'priceMax',
  project_exact: 'projectExact',
  time_grain: 'timeGrain',
  location_grain: 'locationGrain',
  histogram_bins: 'histogramBins',
  show_full_range: 'showFullRange',
  property_age_min: 'propertyAgeMin',
  property_age_max: 'propertyAgeMax',
  property_age_bucket: 'propertyAgeBucket',
  skip_cache: 'skipCache',
  floor_level: 'floorLevel',
  per_page: 'perPage',
  window_months: 'windowMonths',
  min_transactions: 'minTransactions',
  min_units: 'minUnits',
  months_lookback: 'monthsLookback',
};

function toV2ParamKeys(inputParams) {
  const output = {};
  Object.entries(inputParams).forEach(([key, value]) => {
    const mappedKey = V2_PARAM_KEY_MAP[key] || key;
    if (mappedKey in inputParams && mappedKey !== key) {
      return;
    }
    output[mappedKey] = value;
  });
  return output;
}

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
  const params = toV2ParamKeys({ ...additionalParams });
  const {
    includeFactFilter = false,
    excludeLocationDrill = false,
    excludeOwnDimension = null,
  } = options;

  // CLEAN SEMANTIC: Presets send timeframe ID, custom sends explicit dates
  // No mixed semantics - one or the other, never both
  // See timeframes.js: "Frontend passes timeframe ID → Backend resolves to dates"
  const preset = activeFilters.datePreset;

  if (preset && preset !== 'custom') {
    // Preset mode: send timeframe param, NOT dates
    // Backend resolves 'Y1' → last 12 months, 'all' → no filter, etc.
    params.timeframe = preset;
  } else {
    // Custom mode: send explicit dates
    if (activeFilters.dateRange.start) params.dateFrom = activeFilters.dateRange.start;
    if (activeFilters.dateRange.end) params.dateTo = activeFilters.dateRange.end;
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

  // Sale type - page prop takes precedence over filters
  // If sale_type already set in additionalParams (from page), don't override
  // See CLAUDE.md "Business Logic Enforcement" for architectural rationale
  if (excludeOwnDimension !== 'sale_type' && !params.saleType && activeFilters.saleType) {
    params.saleType = activeFilters.saleType;
  }

  // Ranges
  if (activeFilters.psfRange.min !== null) params.psfMin = activeFilters.psfRange.min;
  if (activeFilters.psfRange.max !== null) params.psfMax = activeFilters.psfRange.max;
  if (activeFilters.sizeRange.min !== null) params.sizeMin = activeFilters.sizeRange.min;
  if (activeFilters.sizeRange.max !== null) params.sizeMax = activeFilters.sizeRange.max;

  // Fact filter (for transaction tables)
  if (includeFactFilter) {
    if (factFilter.priceRange?.min !== null) params.priceMin = factFilter.priceRange.min;
    if (factFilter.priceRange?.max !== null) params.priceMax = factFilter.priceRange.max;
  }

  // Other filters
  if (activeFilters.tenure) params.tenure = activeFilters.tenure;
  if (activeFilters.propertyAge?.min !== null) params.propertyAgeMin = activeFilters.propertyAge.min;
  if (activeFilters.propertyAge?.max !== null) params.propertyAgeMax = activeFilters.propertyAge.max;
  if (activeFilters.project) params.project = activeFilters.project;
  if (activeFilters.propertyAgeBucket) params.propertyAgeBucket = activeFilters.propertyAgeBucket;

  return params;
}
