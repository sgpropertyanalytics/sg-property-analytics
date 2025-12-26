/**
 * Active Filters Derivation
 *
 * Pure function to derive combined filters for API calls.
 * PRIORITY ORDER (like Power BI):
 * 1. Sidebar filters (slicers) - HIGHEST priority, never overwritten
 * 2. Cross-filters - only apply if sidebar filter not set
 * 3. Highlights - only apply to date if sidebar date not set
 */

/**
 * Derive active filters from all filter sources.
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
  // Sidebar slicers always take precedence (Power BI behavior)
  if (crossFilter.dimension && crossFilter.value) {
    switch (crossFilter.dimension) {
      case 'district':
        // Only apply if no districts selected in sidebar
        if (filters.districts.length === 0) {
          combined.districts = [crossFilter.value];
        }
        break;
      case 'bedroom':
        // Only apply if no bedroom types selected in sidebar
        if (filters.bedroomTypes.length === 0) {
          combined.bedroomTypes = [parseInt(crossFilter.value)];
        }
        break;
      case 'sale_type':
        // Only apply if no sale type selected in sidebar
        if (!filters.saleType) {
          combined.saleType = crossFilter.value;
        }
        break;
      case 'region':
        // Only apply if no segments selected in sidebar
        if (filters.segments.length === 0) {
          combined.segments = [crossFilter.value];
        }
        break;
      // NOTE: 'project' case removed - project is drill-through only
    }
  }

  // Apply highlight filter ONLY if sidebar date range is NOT set
  // Sidebar date filter always takes precedence
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
        combined.dateRange = {
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
        combined.dateRange = {
          start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
          end: `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        };
      }
    }
  }

  // Apply location breadcrumb filters
  if (breadcrumbs.location.length > 0) {
    if (drillPath.location === 'district') {
      const regionBreadcrumb = breadcrumbs.location[0];
      if (regionBreadcrumb?.value) {
        combined.segments = [String(regionBreadcrumb.value)];
      }
    }
  }

  return combined;
}

/**
 * Count active filters for badge display.
 *
 * @param {Object} filters - Sidebar filters
 * @param {Object} crossFilter - Cross-filter state
 * @param {Object} highlight - Highlight state
 * @returns {number} Count of active filters
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
 *
 * @param {Object} activeFilters - Combined active filters
 * @param {Object} highlight - Highlight state
 * @param {Object} factFilter - Fact filter state
 * @returns {string} JSON string key
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
