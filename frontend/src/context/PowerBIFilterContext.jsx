import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { getFilterOptions } from '../api/client';

const PowerBIFilterContext = createContext(null);

/**
 * PowerBI-style Filter State Management
 *
 * Manages:
 * - Sidebar filters (user-applied filters)
 * - Cross-filters (from chart click interactions)
 * - Drill state (current hierarchy level)
 * - Filter options (available values from API)
 */
export function PowerBIFilterProvider({ children }) {
  // ===== Sidebar Filters =====
  // These are user-applied filters from the filter sidebar
  const [filters, setFilters] = useState({
    dateRange: { start: null, end: null },  // null = all
    districts: [],                           // empty = all
    bedroomTypes: [],                        // empty = all (will default to 2,3,4)
    segment: null,                           // null = all, 'CCR' | 'RCR' | 'OCR'
    saleType: null,                          // null = all, 'New Sale' | 'Resale'
    psfRange: { min: null, max: null },      // null = no restriction
    sizeRange: { min: null, max: null },     // null = no restriction
    tenure: null,                            // null = all, 'Freehold' | '99-year' | '999-year'
    project: null,                           // null = all, project name filter
  });

  // ===== Cross-Filter State =====
  // Applied when user clicks on a CATEGORICAL chart element (district, bedroom, etc.)
  // This FILTERS data - other charts recalculate with only matching data
  const [crossFilter, setCrossFilter] = useState({
    source: null,        // which chart applied it ('location', 'bedroom', 'price')
    dimension: null,     // 'district', 'region', 'bedroom', 'sale_type'
    value: null,         // 'D09', 'CCR', '3', etc.
  });

  // ===== Highlight State =====
  // Applied when user clicks on a TIME chart element (year, quarter, month)
  // This HIGHLIGHTS visually - other charts dim non-matching but keep ALL data
  // Non-destructive: preserves full context while emphasizing selection
  const [highlight, setHighlight] = useState({
    source: null,        // which chart applied it ('time')
    dimension: null,     // 'year', 'quarter', 'month'
    value: null,         // '2024', '2024-Q3', '2024-03', etc.
  });

  // ===== Drill State =====
  // Current granularity level for hierarchical dimensions
  const [drillPath, setDrillPath] = useState({
    time: 'month',       // 'year' | 'quarter' | 'month'
    location: 'district' // 'region' | 'district' | 'project'
  });

  // ===== Breadcrumb Path =====
  // Tracks drill-down path for navigation
  const [breadcrumbs, setBreadcrumbs] = useState({
    time: [],      // e.g., ['All', '2024', 'Q3']
    location: [],  // e.g., ['All', 'CCR', 'D09']
  });

  // ===== Filter Options =====
  // Available values loaded from API
  const [filterOptions, setFilterOptions] = useState({
    districts: [],
    regions: { CCR: [], RCR: [], OCR: [] },
    bedrooms: [],
    saleTypes: [],
    dateRange: { min: null, max: null },
    psfRange: { min: null, max: null },
    sizeRange: { min: null, max: null },
    tenures: [],
    loading: true,
    error: null,
  });

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await getFilterOptions();
        const data = response.data;
        setFilterOptions({
          districts: data.districts || [],
          regions: data.regions || { CCR: [], RCR: [], OCR: [] },
          bedrooms: data.bedrooms || [],
          saleTypes: data.sale_types || [],
          dateRange: data.date_range || { min: null, max: null },
          psfRange: data.psf_range || { min: null, max: null },
          sizeRange: data.size_range || { min: null, max: null },
          tenures: data.tenures || [],
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('Error loading filter options:', err);
        setFilterOptions(prev => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      }
    };
    loadFilterOptions();
  }, []);

  // ===== Filter Setters =====

  const setDateRange = useCallback((start, end) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { start, end }
    }));
  }, []);

  const setDistricts = useCallback((districts) => {
    setFilters(prev => ({
      ...prev,
      districts: Array.isArray(districts) ? districts : [districts]
    }));
  }, []);

  const toggleDistrict = useCallback((district) => {
    setFilters(prev => {
      const districts = [...prev.districts];
      const index = districts.indexOf(district);
      if (index > -1) {
        districts.splice(index, 1);
      } else {
        districts.push(district);
      }
      return { ...prev, districts };
    });
  }, []);

  const setBedroomTypes = useCallback((types) => {
    setFilters(prev => ({
      ...prev,
      bedroomTypes: Array.isArray(types) ? types : [types]
    }));
  }, []);

  const toggleBedroomType = useCallback((type) => {
    setFilters(prev => {
      const bedroomTypes = [...prev.bedroomTypes];
      const index = bedroomTypes.indexOf(type);
      if (index > -1) {
        bedroomTypes.splice(index, 1);
      } else {
        bedroomTypes.push(type);
      }
      return { ...prev, bedroomTypes };
    });
  }, []);

  const setSegment = useCallback((segment) => {
    setFilters(prev => ({ ...prev, segment }));
  }, []);

  const setSaleType = useCallback((saleType) => {
    setFilters(prev => ({ ...prev, saleType }));
  }, []);

  const setPsfRange = useCallback((min, max) => {
    setFilters(prev => ({
      ...prev,
      psfRange: { min, max }
    }));
  }, []);

  const setSizeRange = useCallback((min, max) => {
    setFilters(prev => ({
      ...prev,
      sizeRange: { min, max }
    }));
  }, []);

  const setTenure = useCallback((tenure) => {
    setFilters(prev => ({ ...prev, tenure }));
  }, []);

  const setProject = useCallback((project) => {
    setFilters(prev => ({ ...prev, project }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      dateRange: { start: null, end: null },
      districts: [],
      bedroomTypes: [],
      segment: null,
      saleType: null,
      psfRange: { min: null, max: null },
      sizeRange: { min: null, max: null },
      tenure: null,
      project: null,
    });
    setCrossFilter({ source: null, dimension: null, value: null });
    setHighlight({ source: null, dimension: null, value: null });
    setBreadcrumbs({ time: [], location: [] });
  }, []);

  // ===== Cross-Filter Management =====
  // Use for CATEGORICAL dimensions only (district, region, bedroom, sale_type)
  // This filters data - other charts recalculate

  const applyCrossFilter = useCallback((source, dimension, value) => {
    // Only apply cross-filter for categorical dimensions
    // Time dimensions should use highlight instead
    const categoricalDimensions = ['district', 'region', 'bedroom', 'sale_type', 'project'];
    if (categoricalDimensions.includes(dimension)) {
      setCrossFilter({ source, dimension, value });
      // Clear any existing highlight when applying cross-filter
      setHighlight({ source: null, dimension: null, value: null });
    } else {
      // For time dimensions, use highlight instead
      console.warn(`applyCrossFilter called with time dimension '${dimension}'. Use applyHighlight instead.`);
    }
  }, []);

  const clearCrossFilter = useCallback(() => {
    setCrossFilter({ source: null, dimension: null, value: null });
  }, []);

  // ===== Highlight Management =====
  // Use for TIME dimensions (year, quarter, month)
  // This highlights visually - charts dim non-matching but keep ALL data

  const applyHighlight = useCallback((source, dimension, value) => {
    // Toggle highlight - if same value clicked again, clear it
    setHighlight(prev => {
      if (prev.source === source && prev.dimension === dimension && prev.value === value) {
        return { source: null, dimension: null, value: null };
      }
      return { source, dimension, value };
    });
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlight({ source: null, dimension: null, value: null });
  }, []);

  // ===== Drill Navigation =====

  const drillDown = useCallback((type, value, label) => {
    // Ensure value is always stored as a string for consistency
    // If value is null/undefined (from "Go to Next Level"), don't add breadcrumb
    const hasValue = value != null;
    const stringValue = hasValue ? String(value) : null;
    const stringLabel = hasValue ? (label != null ? String(label) : stringValue) : null;

    if (type === 'time') {
      const levels = ['year', 'quarter', 'month'];
      setDrillPath(prev => {
        const currentIndex = levels.indexOf(prev.time);
        if (currentIndex < levels.length - 1) {
          return { ...prev, time: levels[currentIndex + 1] };
        }
        return prev;
      });
      // Only add breadcrumb if drilling into a specific value
      if (hasValue) {
        setBreadcrumbs(prev => ({
          ...prev,
          time: [...prev.time, { value: stringValue, label: stringLabel }]
        }));
      }
    } else if (type === 'location') {
      const levels = ['region', 'district', 'project'];
      setDrillPath(prev => {
        const currentIndex = levels.indexOf(prev.location);
        if (currentIndex < levels.length - 1) {
          return { ...prev, location: levels[currentIndex + 1] };
        }
        return prev;
      });
      // Only add breadcrumb if drilling into a specific value
      if (hasValue) {
        setBreadcrumbs(prev => ({
          ...prev,
          location: [...prev.location, { value: stringValue, label: stringLabel }]
        }));
      }
    }
  }, []);

  const drillUp = useCallback((type) => {
    if (type === 'time') {
      const levels = ['year', 'quarter', 'month'];
      setDrillPath(prev => {
        const currentIndex = levels.indexOf(prev.time);
        if (currentIndex > 0) {
          return { ...prev, time: levels[currentIndex - 1] };
        }
        return prev;
      });
      setBreadcrumbs(prev => ({
        ...prev,
        time: prev.time.length > 0 ? prev.time.slice(0, -1) : []
      }));
    } else if (type === 'location') {
      const levels = ['region', 'district', 'project'];
      setDrillPath(prev => {
        const currentIndex = levels.indexOf(prev.location);
        if (currentIndex > 0) {
          return { ...prev, location: levels[currentIndex - 1] };
        }
        return prev;
      });
      setBreadcrumbs(prev => ({
        ...prev,
        location: prev.location.length > 0 ? prev.location.slice(0, -1) : []
      }));
    }
  }, []);

  const navigateToBreadcrumb = useCallback((type, index) => {
    if (type === 'time') {
      const levels = ['year', 'quarter', 'month'];
      setDrillPath(prev => ({ ...prev, time: levels[index] }));
      setBreadcrumbs(prev => ({
        ...prev,
        time: prev.time.slice(0, index)
      }));
    } else if (type === 'location') {
      const levels = ['region', 'district', 'project'];
      setDrillPath(prev => ({ ...prev, location: levels[index] }));
      setBreadcrumbs(prev => ({
        ...prev,
        location: prev.location.slice(0, index)
      }));
    }
  }, []);

  // ===== Derived: Combined filters for API calls =====
  // PRIORITY ORDER (like Power BI):
  // 1. Sidebar filters (slicers) - HIGHEST priority, never overwritten
  // 2. Cross-filters - only apply if sidebar filter not set
  // 3. Highlights - only apply to date if sidebar date not set
  const activeFilters = useMemo(() => {
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
          // Only apply if no segment selected in sidebar
          if (!filters.segment) {
            combined.segment = crossFilter.value;
          }
          break;
        case 'project':
          // Only apply if no project selected in sidebar
          if (!filters.project) {
            combined.project = crossFilter.value;
          }
          break;
      }
    }

    // Apply highlight filter ONLY if sidebar date range is NOT set
    // Sidebar date filter always takes precedence
    if (highlight.dimension && highlight.value) {
      const sidebarDateSet = filters.dateRange.start || filters.dateRange.end;

      if (!sidebarDateSet) {
        if (highlight.dimension === 'month') {
          combined.dateRange = {
            start: `${highlight.value}-01`,
            end: `${highlight.value}-31`
          };
        } else if (highlight.dimension === 'quarter') {
          // Parse quarter (e.g., "2024-Q3" -> start: 2024-07-01, end: 2024-09-30)
          const [year, q] = highlight.value.split('-Q');
          const quarterMonth = (parseInt(q) - 1) * 3 + 1;
          combined.dateRange = {
            start: `${year}-${String(quarterMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(quarterMonth + 2).padStart(2, '0')}-31`
          };
        } else if (highlight.dimension === 'year') {
          combined.dateRange = {
            start: `${highlight.value}-01-01`,
            end: `${highlight.value}-12-31`
          };
        }
      }
    }

    // Apply time breadcrumb filters
    // Breadcrumbs track drill-down path for time: year -> quarter -> month
    if (breadcrumbs.time.length > 0) {
      const lastTime = breadcrumbs.time[breadcrumbs.time.length - 1];
      if (lastTime && lastTime.value) {
        if (drillPath.time === 'quarter') {
          // At quarter level - first breadcrumb is year
          const yearStr = String(breadcrumbs.time[0].value);
          combined.dateRange = {
            start: `${yearStr}-01-01`,
            end: `${yearStr}-12-31`
          };
        } else if (drillPath.time === 'month') {
          // At month level - last breadcrumb is quarter
          const lastValue = String(lastTime.value);

          // Get year: either from first breadcrumb or parse from quarter value
          let year;
          if (breadcrumbs.time.length >= 2) {
            year = String(breadcrumbs.time[0].value);
          } else {
            // Quarter value might contain year (e.g., "2024-Q3")
            const yearMatch = lastValue.match(/^(\d{4})/);
            year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
          }

          // Extract quarter number from "2024-Q3" or "Q3" format
          const qMatch = lastValue.match(/Q(\d)/);
          const q = qMatch ? parseInt(qMatch[1]) : 1;
          const quarterMonth = (q - 1) * 3 + 1;
          combined.dateRange = {
            start: `${year}-${String(quarterMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(quarterMonth + 2).padStart(2, '0')}-31`
          };
        }
      }
    }

    // Apply location breadcrumb filters
    // Breadcrumbs track drill-down path - each entry represents what was clicked at that level
    // The meaning depends on the current drillPath level and breadcrumb count
    if (breadcrumbs.location.length > 0) {
      // Determine what filters to apply based on drill hierarchy
      // Levels: region -> district -> project
      // When at 'district' level with breadcrumbs: first breadcrumb is region/segment
      // When at 'project' level with breadcrumbs: last breadcrumb is always district

      if (drillPath.location === 'district') {
        // At district level - breadcrumbs contain region(s) we drilled through
        const regionBreadcrumb = breadcrumbs.location[0];
        if (regionBreadcrumb?.value) {
          combined.segment = String(regionBreadcrumb.value);
        }
      } else if (drillPath.location === 'project') {
        // At project level - need to apply district filter
        // Last breadcrumb is always the district we drilled into
        const lastBreadcrumb = breadcrumbs.location[breadcrumbs.location.length - 1];
        if (lastBreadcrumb?.value) {
          combined.districts = [String(lastBreadcrumb.value)];
        }
        // If we have 2+ breadcrumbs, first is region
        if (breadcrumbs.location.length >= 2) {
          const regionBreadcrumb = breadcrumbs.location[0];
          if (regionBreadcrumb?.value) {
            combined.segment = String(regionBreadcrumb.value);
          }
        }
      } else if (drillPath.location === 'region') {
        // At region level - no location filters from breadcrumbs (showing all regions)
        // But might have filters from sidebar
      }
    }

    return combined;
  }, [filters, crossFilter, highlight, breadcrumbs, drillPath]);

  // ===== Build API query params from active filters =====
  // Options:
  //   excludeHighlight: true - excludes time highlight filter (for time chart to show all periods)
  const buildApiParams = useCallback((additionalParams = {}, options = {}) => {
    const params = { ...additionalParams };
    const { excludeHighlight = false } = options;

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

    if (activeFilters.districts.length > 0) {
      params.district = activeFilters.districts.join(',');
    }
    // Only filter by bedroom if user explicitly selects bedrooms
    // No default - show all bedroom types when none selected
    if (activeFilters.bedroomTypes.length > 0) {
      params.bedroom = activeFilters.bedroomTypes.join(',');
    }
    if (activeFilters.segment) {
      params.segment = activeFilters.segment;
    }
    if (activeFilters.saleType) {
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
    if (activeFilters.tenure) {
      params.tenure = activeFilters.tenure;
    }
    if (activeFilters.project) {
      params.project = activeFilters.project;
    }

    return params;
  }, [activeFilters, filters, highlight]);

  // ===== Count active filters =====
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange.start || filters.dateRange.end) count++;
    if (filters.districts.length > 0) count++;
    if (filters.bedroomTypes.length > 0) count++;
    if (filters.segment) count++;
    if (filters.saleType) count++;
    if (filters.psfRange.min !== null || filters.psfRange.max !== null) count++;
    if (filters.sizeRange.min !== null || filters.sizeRange.max !== null) count++;
    if (filters.tenure) count++;
    if (filters.project) count++;
    if (crossFilter.value) count++;
    if (highlight.value) count++;  // Include time highlight in active filter count
    return count;
  }, [filters, crossFilter, highlight]);

  const value = {
    // State
    filters,
    crossFilter,
    highlight,         // NEW: for non-filtering visual emphasis
    drillPath,
    breadcrumbs,
    filterOptions,
    activeFilters,
    activeFilterCount,

    // Filter setters
    setDateRange,
    setDistricts,
    toggleDistrict,
    setBedroomTypes,
    toggleBedroomType,
    setSegment,
    setSaleType,
    setPsfRange,
    setSizeRange,
    setTenure,
    setProject,
    resetFilters,

    // Cross-filter (for categorical dimensions - filters data)
    applyCrossFilter,
    clearCrossFilter,

    // Highlight (for time dimensions - visual only, preserves context)
    applyHighlight,
    clearHighlight,

    // Drill navigation
    drillDown,
    drillUp,
    navigateToBreadcrumb,

    // Helpers
    buildApiParams,
  };

  return (
    <PowerBIFilterContext.Provider value={value}>
      {children}
    </PowerBIFilterContext.Provider>
  );
}

export function usePowerBIFilters() {
  const context = useContext(PowerBIFilterContext);
  if (!context) {
    throw new Error('usePowerBIFilters must be used within PowerBIFilterProvider');
  }
  return context;
}
