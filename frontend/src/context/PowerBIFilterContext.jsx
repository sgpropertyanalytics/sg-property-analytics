import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getFilterOptions } from '../api/client';

const PowerBIFilterContext = createContext(null);

// ===== Time Grouping Constants =====
// Single source of truth for API mapping
// This is a VIEW CONTEXT control (not a filter) - controls how data is aggregated
export const TIME_GROUP_BY = {
  year: 'year',
  quarter: 'quarter',
  month: 'month'
};

/**
 * PowerBI-style Filter State Management
 *
 * Manages:
 * - Sidebar filters (user-applied filters)
 * - Cross-filters (from chart click interactions)
 * - Drill state (current hierarchy level)
 * - Filter options (available values from API)
 * - Selected project (drill-through only, does NOT affect global charts)
 *
 * IMPORTANT: Global location hierarchy stops at District.
 * Project selection is drill-through only (opens ProjectDetailPanel).
 */
export function PowerBIFilterProvider({ children }) {
  // ===== Sidebar Filters =====
  // These are user-applied filters from the filter sidebar
  const [filters, setFilters] = useState({
    dateRange: { start: null, end: null },  // null = all
    districts: [],                           // empty = all
    bedroomTypes: [],                        // empty = all (supports 1,2,3,4,5)
    segments: [],                            // empty = all, can contain 'CCR', 'RCR', 'OCR'
    saleType: null,                          // null = all, 'New Sale' | 'Resale'
    psfRange: { min: null, max: null },      // null = no restriction
    sizeRange: { min: null, max: null },     // null = no restriction
    tenure: null,                            // null = all, 'Freehold' | '99-year' | '999-year'
    propertyAge: { min: null, max: null },   // null = no restriction, property age in years
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

  // ===== Fact Filter State =====
  // Filters that only apply to FACT tables (Transaction Data Table)
  // Dimension charts ignore these - follows Power BI best practice:
  // Dimension → Fact (one-way filtering)
  const [factFilter, setFactFilter] = useState({
    priceRange: { min: null, max: null },  // from Price Distribution chart click
  });

  // ===== Highlight State =====
  // Applied when user clicks on a TIME chart element (year, quarter, month)
  // Per Option A (claude.md): Highlights ACT AS CROSS-FILTERS for time dimensions.
  // activeFilters merges highlight into dateRange, triggering backend queries.
  // This ensures "time click = filter to that period" behavior across all visuals.
  const [highlight, setHighlight] = useState({
    source: null,        // which chart applied it ('time')
    dimension: null,     // 'year', 'quarter', 'month'
    value: null,         // '2024', '2024-Q3', '2024-03', etc.
  });

  // ===== Drill State =====
  // Current granularity level for hierarchical dimensions
  // Location hierarchy: region (CCR/RCR/OCR) -> district (STOPS HERE - no project)
  // Project is drill-through only, managed via selectedProject state
  const [drillPath, setDrillPath] = useState({
    time: 'month',       // 'year' | 'quarter' | 'month'
    location: 'region'   // 'region' | 'district' (NO 'project' - that's drill-through)
  });

  // ===== Selected Project (Drill-Through Only) =====
  // When a project is selected, it opens ProjectDetailPanel
  // This does NOT affect global charts - only the detail panel uses this
  const [selectedProject, setSelectedProjectState] = useState({
    name: null,      // Project name
    district: null,  // District the project is in (for context)
  });

  // ===== Breadcrumb Path =====
  // Tracks drill-down path for navigation
  const [breadcrumbs, setBreadcrumbs] = useState({
    time: [],      // e.g., ['All', '2024', 'Q3']
    location: [],  // e.g., ['All', 'CCR', 'D09']
  });

  // ===== Time Grouping (View Context) =====
  // This is NOT a filter - it's a view context control that determines time aggregation
  // Lives in toolbar (not sidebar) because it changes how data is displayed, not what data
  // Persisted to localStorage so user preference is remembered
  const [timeGrouping, setTimeGroupingState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_time_pref') || 'quarter';
    }
    return 'quarter';
  });

  // Wrapped setter that persists to localStorage
  const setTimeGrouping = useCallback((val) => {
    setTimeGroupingState(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_time_pref', val);
    }
  }, []);

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

  const setSegments = useCallback((segments) => {
    setFilters(prev => ({
      ...prev,
      segments: Array.isArray(segments) ? segments : [segments]
    }));
  }, []);

  const toggleSegment = useCallback((segment) => {
    setFilters(prev => {
      const segments = [...prev.segments];
      const index = segments.indexOf(segment);
      if (index > -1) {
        segments.splice(index, 1);
      } else {
        segments.push(segment);
      }
      return { ...prev, segments };
    });
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

  const setPropertyAge = useCallback((min, max) => {
    setFilters(prev => ({
      ...prev,
      propertyAge: { min, max }
    }));
  }, []);

  const setProject = useCallback((project) => {
    setFilters(prev => ({ ...prev, project }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      dateRange: { start: null, end: null },
      districts: [],
      bedroomTypes: [],
      segments: [],
      saleType: null,
      psfRange: { min: null, max: null },
      sizeRange: { min: null, max: null },
      tenure: null,
      propertyAge: { min: null, max: null },
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
    // Handle price range cross-filter specially - goes to factFilter only
    // This follows Power BI best practice: Dimension → Fact (one-way)
    // Price Distribution is a dimension chart, Transaction Table is fact
    if (dimension === 'price_range') {
      // value is "min-max" string like "1000000-2000000"
      const [min, max] = value.split('-').map(Number);
      // Set in factFilter (only affects Transaction Data Table)
      setFactFilter(prev => ({
        ...prev,
        priceRange: { min, max }
      }));
      // Also set crossFilter for UI display (badge showing "Filter: $1M-$2M")
      setCrossFilter({ source, dimension, value });
      setHighlight({ source: null, dimension: null, value: null });
      return;
    }

    // Only apply cross-filter for categorical dimensions
    // Time dimensions should use highlight instead
    // NOTE: 'project' is NOT included - project is drill-through only (opens ProjectDetailPanel)
    const categoricalDimensions = ['district', 'region', 'bedroom', 'sale_type'];
    if (categoricalDimensions.includes(dimension)) {
      // Toggle behavior: clicking same value again clears the filter
      setCrossFilter(prev => {
        if (prev.dimension === dimension && prev.value === value) {
          return { source: null, dimension: null, value: null };
        }
        return { source, dimension, value };
      });
      // Clear any existing highlight when applying cross-filter
      setHighlight({ source: null, dimension: null, value: null });
    } else {
      // For time dimensions, use highlight instead
      console.warn(`applyCrossFilter called with time dimension '${dimension}'. Use applyHighlight instead.`);
    }
  }, []);

  const clearCrossFilter = useCallback(() => {
    setCrossFilter({ source: null, dimension: null, value: null });
    // Also clear factFilter (price range from dimension chart click)
    setFactFilter({
      priceRange: { min: null, max: null }
    });
  }, []);

  // ===== Highlight Management =====
  // Use for TIME dimensions (year, quarter, month)
  // Per standard: Time click = cross-filter. Highlight is merged into activeFilters.dateRange.

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
      // Location hierarchy: region -> district (STOPS HERE - no project in global hierarchy)
      // Project is drill-through only, not part of global drill
      const levels = ['region', 'district'];
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
      // Location hierarchy: region -> district (no project in global hierarchy)
      const levels = ['region', 'district'];
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
      // Also clear any cross-filter on location when drilling up
      setCrossFilter({ source: null, dimension: null, value: null });
      // Also clear selected project when drilling up in location
      setSelectedProjectState({ name: null, district: null });
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
      // Location hierarchy: region -> district (no project in global hierarchy)
      const levels = ['region', 'district'];
      setDrillPath(prev => ({ ...prev, location: levels[index] }));
      setBreadcrumbs(prev => ({
        ...prev,
        location: prev.location.slice(0, index)
      }));
      // Clear cross-filter when navigating breadcrumbs
      setCrossFilter({ source: null, dimension: null, value: null });
      // Clear selected project when navigating location breadcrumbs
      setSelectedProjectState({ name: null, district: null });
    }
  }, []);

  // ===== Project Selection (Drill-Through Only) =====
  // This does NOT affect global charts - only opens ProjectDetailPanel
  const setSelectedProject = useCallback((projectName, district = null) => {
    setSelectedProjectState({
      name: projectName,
      district: district,
    });
  }, []);

  const clearSelectedProject = useCallback(() => {
    setSelectedProjectState({ name: null, district: null });
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
          // Only apply if no segments selected in sidebar
          if (filters.segments.length === 0) {
            combined.segments = [crossFilter.value];
          }
          break;
        // NOTE: 'project' case removed - project is drill-through only (opens ProjectDetailPanel)
        // Project selection does NOT affect global charts
      }
    }

    // Apply highlight filter ONLY if sidebar date range is NOT set
    // Sidebar date filter always takes precedence
    if (highlight.dimension && highlight.value) {
      const sidebarDateSet = filters.dateRange.start || filters.dateRange.end;

      if (!sidebarDateSet) {
        if (highlight.dimension === 'month') {
          // Get last day of month correctly (e.g., Sep has 30, Feb has 28/29)
          // Note: month from date string is 1-based (Jan=1, Dec=12)
          // new Date(year, month, 0) works because JS month is 0-indexed,
          // so month=9 (Sep) → October day 0 → last day of September
          const [year, month] = highlight.value.split('-');
          const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
          combined.dateRange = {
            start: `${highlight.value}-01`,
            end: `${highlight.value}-${String(lastDay).padStart(2, '0')}`
          };
        } else if (highlight.dimension === 'quarter') {
          // Parse quarter (e.g., "2024-Q3" -> start: 2024-07-01, end: 2024-09-30)
          const [year, q] = highlight.value.split('-Q');
          const quarterStartMonth = (parseInt(q) - 1) * 3 + 1;
          const quarterEndMonth = quarterStartMonth + 2;
          // Get last day of the quarter's final month (same month indexing trick as above)
          const lastDay = new Date(parseInt(year), quarterEndMonth, 0).getDate();
          combined.dateRange = {
            start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
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
          const quarterStartMonth = (q - 1) * 3 + 1;  // Q1=1, Q2=4, Q3=7, Q4=10
          const quarterEndMonth = quarterStartMonth + 2;  // Q1=3, Q2=6, Q3=9, Q4=12
          // Get last day of quarter's final month (month is 1-based, day 0 trick)
          const lastDay = new Date(parseInt(year), quarterEndMonth, 0).getDate();
          combined.dateRange = {
            start: `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
          };
        }
      }
    }

    // Apply location breadcrumb filters
    // Hierarchy: region -> district (NO project in global hierarchy)
    // Breadcrumbs: [region] at district level
    // Project is drill-through only - handled separately via selectedProject state
    if (breadcrumbs.location.length > 0) {
      if (drillPath.location === 'district') {
        // At district level - filter by the region (segment) we drilled into
        const regionBreadcrumb = breadcrumbs.location[0];
        if (regionBreadcrumb?.value) {
          combined.segments = [String(regionBreadcrumb.value)];
        }
      }
      // At 'region' level - no location filters from breadcrumbs (showing all regions)
      // NOTE: No 'project' level in global hierarchy - project is drill-through only
    }

    return combined;
  }, [filters, crossFilter, highlight, breadcrumbs, drillPath]);

  // ===== Stable Filter Key for Chart Dependencies =====
  // This is a PRIMITIVE STRING that changes only when filters actually change.
  // Charts should use this (plus their local options) as useEffect dependency
  // instead of buildApiParams, which has unstable identity.
  //
  // Pattern: Charts call buildApiParams() to get params, but depend on filterKey for refetch trigger.
  const filterKey = useMemo(() => {
    return JSON.stringify({
      // Core filters from activeFilters
      dateRange: activeFilters.dateRange,
      districts: activeFilters.districts,
      bedroomTypes: activeFilters.bedroomTypes,
      segments: activeFilters.segments,
      saleType: activeFilters.saleType,
      psfRange: activeFilters.psfRange,
      sizeRange: activeFilters.sizeRange,
      tenure: activeFilters.tenure,
      propertyAge: activeFilters.propertyAge,
      project: activeFilters.project,
      // Highlight state (for time series)
      highlight: highlight.value ? { dim: highlight.dimension, val: highlight.value } : null,
      // Fact filter (for transaction table)
      factFilter: factFilter.priceRange,
    });
  }, [activeFilters, highlight.dimension, highlight.value, factFilter.priceRange]);

  // ===== Debounced Filter Key =====
  // Delays effect triggers by 200ms when users click multiple filters in quick succession.
  // This prevents firing 8+ API calls per click during active filter adjustment.
  // Charts should use debouncedFilterKey (not filterKey) in useEffect dependencies.
  const [debouncedFilterKey, setDebouncedFilterKey] = useState(filterKey);
  const debounceTimeoutRef = useRef(null);
  const isFirstFilterRender = useRef(true);

  useEffect(() => {
    // Skip debouncing on first render to ensure immediate initial load
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      setDebouncedFilterKey(filterKey);
      return;
    }

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set debounced update after 200ms
    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedFilterKey(filterKey);
    }, 200);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filterKey]);

  // ===== Build API query params from active filters =====
  // Options:
  //   excludeHighlight: true - excludes time highlight filter (for time chart to show all periods)
  //   includeFactFilter: true - includes factFilter (only for Fact tables like Transaction Data Table)
  //   excludeLocationDrill: true - excludes location drill filters (Power BI best practice: drill is visual-local)
  //   excludeOwnDimension: string - excludes a specific dimension filter (Power BI best practice: anchor charts)
  //     Values: 'segment', 'bedroom', 'district', 'sale_type', 'date'
  //     Use this for anchor charts that should show full distribution with visual highlight
  const buildApiParams = useCallback((additionalParams = {}, options = {}) => {
    const params = { ...additionalParams };
    const { excludeHighlight = false, includeFactFilter = false, excludeLocationDrill = false, excludeOwnDimension = null } = options;

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
    // excludeLocationDrill implements Power BI best practice: Drill ≠ Filter (drill is visual-local)
    // Skip if this is an anchor chart for district dimension
    if (excludeOwnDimension !== 'district') {
      if (excludeLocationDrill) {
        // Only apply sidebar district filter, ignore location drill breadcrumbs
        if (filters.districts.length > 0) {
          params.district = filters.districts.join(',');
        }
      } else if (activeFilters.districts.length > 0) {
        params.district = activeFilters.districts.join(',');
      }
    }
    // Only filter by bedroom if user explicitly selects bedrooms
    // No default - show all bedroom types when none selected
    // Skip if this is an anchor chart for bedroom dimension (Power BI: same dimension = no interaction)
    if (excludeOwnDimension !== 'bedroom' && activeFilters.bedroomTypes.length > 0) {
      params.bedroom = activeFilters.bedroomTypes.join(',');
    }
    // For segment: apply sidebar filter OR location drill filter (unless excluded)
    // Skip if this is an anchor chart for segment dimension (Power BI: same dimension = no interaction)
    if (excludeOwnDimension !== 'segment') {
      if (excludeLocationDrill) {
        // Only apply sidebar segment filter, ignore location drill breadcrumbs
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
    // Price range from factFilter - only include for Fact tables (Transaction Data Table)
    // This implements Power BI best practice: Dimension → Fact (one-way filtering)
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

    return params;
  }, [activeFilters, filters, highlight, factFilter]);

  // ===== Count active filters =====
  const activeFilterCount = useMemo(() => {
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
    if (filters.project) count++;
    if (crossFilter.value) count++;
    if (highlight.value) count++;  // Include time highlight in active filter count
    return count;
  }, [filters, crossFilter, highlight]);

  const value = {
    // State
    filters,
    crossFilter,
    factFilter,        // Filters that only apply to Fact tables (Dimension → Fact)
    highlight,         // Time cross-filter (merged into activeFilters.dateRange)
    drillPath,
    breadcrumbs,
    filterOptions,
    activeFilters,
    activeFilterCount,
    filterKey,         // Stable primitive for chart useEffect dependencies (avoids cascade refetch)
    debouncedFilterKey, // Debounced (200ms) version - use this for fetch effects to prevent rapid-fire requests
    selectedProject,   // Drill-through only - does NOT affect global charts

    // Time Grouping (View Context - NOT a filter)
    // Controls how time is aggregated across all time-series charts
    timeGrouping,
    setTimeGrouping,

    // Filter setters
    setDateRange,
    setDistricts,
    toggleDistrict,
    setBedroomTypes,
    toggleBedroomType,
    setSegments,
    toggleSegment,
    setSaleType,
    setPsfRange,
    setSizeRange,
    setTenure,
    setPropertyAge,
    setProject,
    resetFilters,

    // Cross-filter (for categorical dimensions - filters data)
    applyCrossFilter,
    clearCrossFilter,

    // Highlight (for time dimensions - acts as cross-filter per standard)
    applyHighlight,
    clearHighlight,

    // Drill navigation
    drillDown,
    drillUp,
    navigateToBreadcrumb,

    // Project drill-through (does NOT affect global charts)
    setSelectedProject,
    clearSelectedProject,

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
