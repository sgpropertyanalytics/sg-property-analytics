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
  // Applied when user clicks on a chart element
  const [crossFilter, setCrossFilter] = useState({
    source: null,        // which chart applied it ('district', 'time', 'bedroom', 'price')
    dimension: null,     // 'district', 'month', 'quarter', 'year', 'bedroom', 'sale_type'
    value: null,         // 'D09', '2024-03', '3', etc.
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
    setBreadcrumbs({ time: [], location: [] });
  }, []);

  // ===== Cross-Filter Management =====

  const applyCrossFilter = useCallback((source, dimension, value) => {
    setCrossFilter({ source, dimension, value });
  }, []);

  const clearCrossFilter = useCallback(() => {
    setCrossFilter({ source: null, dimension: null, value: null });
  }, []);

  // ===== Drill Navigation =====

  const drillDown = useCallback((type, value, label) => {
    if (type === 'time') {
      const levels = ['year', 'quarter', 'month'];
      const currentIndex = levels.indexOf(drillPath.time);
      if (currentIndex < levels.length - 1) {
        setDrillPath(prev => ({ ...prev, time: levels[currentIndex + 1] }));
        setBreadcrumbs(prev => ({
          ...prev,
          time: [...prev.time, { value, label: label || value }]
        }));
      }
    } else if (type === 'location') {
      const levels = ['region', 'district', 'project'];
      const currentIndex = levels.indexOf(drillPath.location);
      if (currentIndex < levels.length - 1) {
        setDrillPath(prev => ({ ...prev, location: levels[currentIndex + 1] }));
        setBreadcrumbs(prev => ({
          ...prev,
          location: [...prev.location, { value, label: label || value }]
        }));
      }
    }
  }, [drillPath]);

  const drillUp = useCallback((type) => {
    if (type === 'time') {
      const levels = ['year', 'quarter', 'month'];
      const currentIndex = levels.indexOf(drillPath.time);
      if (currentIndex > 0) {
        setDrillPath(prev => ({ ...prev, time: levels[currentIndex - 1] }));
        setBreadcrumbs(prev => ({
          ...prev,
          time: prev.time.slice(0, -1)
        }));
      }
    } else if (type === 'location') {
      const levels = ['region', 'district', 'project'];
      const currentIndex = levels.indexOf(drillPath.location);
      if (currentIndex > 0) {
        setDrillPath(prev => ({ ...prev, location: levels[currentIndex - 1] }));
        setBreadcrumbs(prev => ({
          ...prev,
          location: prev.location.slice(0, -1)
        }));
      }
    }
  }, [drillPath]);

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
  const activeFilters = useMemo(() => {
    const combined = { ...filters };

    // Apply cross-filter if set
    if (crossFilter.dimension && crossFilter.value) {
      switch (crossFilter.dimension) {
        case 'district':
          combined.districts = [crossFilter.value];
          break;
        case 'month':
        case 'quarter':
        case 'year':
          // Apply date filter based on cross-filter
          if (crossFilter.dimension === 'month') {
            combined.dateRange = {
              start: `${crossFilter.value}-01`,
              end: `${crossFilter.value}-31`
            };
          } else if (crossFilter.dimension === 'quarter') {
            // Parse quarter (e.g., "2024-Q3" -> start: 2024-07-01, end: 2024-09-30)
            const [year, q] = crossFilter.value.split('-Q');
            const quarterMonth = (parseInt(q) - 1) * 3 + 1;
            combined.dateRange = {
              start: `${year}-${String(quarterMonth).padStart(2, '0')}-01`,
              end: `${year}-${String(quarterMonth + 2).padStart(2, '0')}-31`
            };
          } else if (crossFilter.dimension === 'year') {
            combined.dateRange = {
              start: `${crossFilter.value}-01-01`,
              end: `${crossFilter.value}-12-31`
            };
          }
          break;
        case 'bedroom':
          combined.bedroomTypes = [parseInt(crossFilter.value)];
          break;
        case 'sale_type':
          combined.saleType = crossFilter.value;
          break;
        case 'region':
          combined.segment = crossFilter.value;
          break;
      }
    }

    // Apply breadcrumb filters
    if (breadcrumbs.time.length > 0) {
      const lastTime = breadcrumbs.time[breadcrumbs.time.length - 1];
      if (lastTime) {
        // Apply date filter from breadcrumb
        if (drillPath.time === 'quarter' && breadcrumbs.time.length === 1) {
          // Year selected, filter to that year
          combined.dateRange = {
            start: `${lastTime.value}-01-01`,
            end: `${lastTime.value}-12-31`
          };
        } else if (drillPath.time === 'month' && breadcrumbs.time.length === 2) {
          // Quarter selected
          const year = breadcrumbs.time[0].value;
          const q = parseInt(lastTime.value.replace('Q', ''));
          const quarterMonth = (q - 1) * 3 + 1;
          combined.dateRange = {
            start: `${year}-${String(quarterMonth).padStart(2, '0')}-01`,
            end: `${year}-${String(quarterMonth + 2).padStart(2, '0')}-31`
          };
        }
      }
    }

    if (breadcrumbs.location.length > 0) {
      const lastLoc = breadcrumbs.location[breadcrumbs.location.length - 1];
      if (lastLoc) {
        if (drillPath.location === 'district' && breadcrumbs.location.length === 1) {
          // Region selected
          combined.segment = lastLoc.value;
        } else if (drillPath.location === 'project' && breadcrumbs.location.length === 2) {
          // District selected
          combined.districts = [lastLoc.value];
        }
      }
    }

    return combined;
  }, [filters, crossFilter, breadcrumbs, drillPath]);

  // ===== Build API query params from active filters =====
  const buildApiParams = useCallback((additionalParams = {}) => {
    const params = { ...additionalParams };

    if (activeFilters.dateRange.start) {
      params.date_from = activeFilters.dateRange.start;
    }
    if (activeFilters.dateRange.end) {
      params.date_to = activeFilters.dateRange.end;
    }
    if (activeFilters.districts.length > 0) {
      params.district = activeFilters.districts.join(',');
    }
    if (activeFilters.bedroomTypes.length > 0) {
      params.bedroom = activeFilters.bedroomTypes.join(',');
    } else {
      // Default to 2,3,4 BR if none selected
      params.bedroom = '2,3,4';
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
  }, [activeFilters]);

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
    return count;
  }, [filters, crossFilter]);

  const value = {
    // State
    filters,
    crossFilter,
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

    // Cross-filter
    applyCrossFilter,
    clearCrossFilter,

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
