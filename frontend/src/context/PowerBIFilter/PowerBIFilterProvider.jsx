/**
 * PowerBI-style Filter State Management
 *
 * Manages:
 * - Sidebar filters (user-applied filters)
 * - Drill state (current hierarchy level)
 * - Filter options (available values from API)
 * - Selected project (drill-through only, does NOT affect global charts)
 *
 * IMPORTANT: Global location hierarchy stops at District.
 * Project selection is drill-through only (opens ProjectDetailPanel).
 */

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// Constants and initial state
import {
  INITIAL_FILTERS,
  INITIAL_FACT_FILTER,
  INITIAL_DRILL_PATH,
  INITIAL_SELECTED_PROJECT,
  INITIAL_BREADCRUMBS,
  TIME_LEVELS,
  LOCATION_LEVELS,
} from './constants';

// Derived state and API params (consolidated)
import {
  deriveActiveFilters,
  countActiveFilters,
  generateFilterKey,
  buildApiParamsFromState,
} from './utils';

// Hooks (consolidated)
import { useFilterOptions, useRouteReset, useDebouncedFilterKey } from './hooks';

const PowerBIFilterContext = createContext(null);

export function PowerBIFilterProvider({ children }) {
  // ===== Core State =====
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [factFilter, setFactFilter] = useState(INITIAL_FACT_FILTER);
  const [drillPath, setDrillPath] = useState(INITIAL_DRILL_PATH);
  const [selectedProject, setSelectedProjectState] = useState(INITIAL_SELECTED_PROJECT);
  const [breadcrumbs, setBreadcrumbs] = useState(INITIAL_BREADCRUMBS);

  // ===== Time Grouping (View Context) =====
  const [timeGrouping, setTimeGroupingState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_time_pref') || 'quarter';
    }
    return 'quarter';
  });

  const setTimeGrouping = useCallback((val) => {
    setTimeGroupingState(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('user_time_pref', val);
    }
  }, []);

  // ===== Filter Options (from API) =====
  const [filterOptions] = useFilterOptions();

  // ===== Route Change Reset =====
  useRouteReset({
    setDrillPath,
    setBreadcrumbs,
    setFactFilter,
    setSelectedProject: setSelectedProjectState,
  });

  // ===== Filter Setters =====
  const setDateRange = useCallback((start, end) => {
    setFilters((prev) => ({ ...prev, dateRange: { start, end } }));
  }, []);

  const setDistricts = useCallback((districts) => {
    setFilters((prev) => ({
      ...prev,
      districts: Array.isArray(districts) ? districts : [districts],
    }));
  }, []);

  const toggleDistrict = useCallback((district) => {
    setFilters((prev) => {
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
    setFilters((prev) => ({
      ...prev,
      bedroomTypes: Array.isArray(types) ? types : [types],
    }));
  }, []);

  const toggleBedroomType = useCallback((type) => {
    setFilters((prev) => {
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
    setFilters((prev) => ({
      ...prev,
      segments: Array.isArray(segments) ? segments : [segments],
    }));
  }, []);

  const toggleSegment = useCallback((segment) => {
    setFilters((prev) => {
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
    setFilters((prev) => ({ ...prev, saleType }));
  }, []);

  const setPsfRange = useCallback((min, max) => {
    setFilters((prev) => ({ ...prev, psfRange: { min, max } }));
  }, []);

  const setSizeRange = useCallback((min, max) => {
    setFilters((prev) => ({ ...prev, sizeRange: { min, max } }));
  }, []);

  const setTenure = useCallback((tenure) => {
    setFilters((prev) => ({ ...prev, tenure }));
  }, []);

  const setPropertyAge = useCallback((min, max) => {
    setFilters((prev) => ({ ...prev, propertyAge: { min, max } }));
  }, []);

  const setPropertyAgeBucket = useCallback((bucket) => {
    setFilters((prev) => ({ ...prev, propertyAgeBucket: bucket }));
  }, []);

  const setProject = useCallback((project) => {
    setFilters((prev) => ({ ...prev, project }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setBreadcrumbs(INITIAL_BREADCRUMBS);
  }, []);

  // ===== Drill Navigation =====
  const drillDown = useCallback((type, value, label) => {
    const hasValue = value != null;
    const stringValue = hasValue ? String(value) : null;
    const stringLabel = hasValue ? (label != null ? String(label) : stringValue) : null;

    if (type === 'time') {
      setDrillPath((prev) => {
        const currentIndex = TIME_LEVELS.indexOf(prev.time);
        if (currentIndex < TIME_LEVELS.length - 1) {
          return { ...prev, time: TIME_LEVELS[currentIndex + 1] };
        }
        return prev;
      });
      if (hasValue) {
        setBreadcrumbs((prev) => ({
          ...prev,
          time: [...prev.time, { value: stringValue, label: stringLabel }],
        }));
      }
    } else if (type === 'location') {
      setDrillPath((prev) => {
        const currentIndex = LOCATION_LEVELS.indexOf(prev.location);
        if (currentIndex < LOCATION_LEVELS.length - 1) {
          return { ...prev, location: LOCATION_LEVELS[currentIndex + 1] };
        }
        return prev;
      });
      if (hasValue) {
        setBreadcrumbs((prev) => ({
          ...prev,
          location: [...prev.location, { value: stringValue, label: stringLabel }],
        }));
      }
    }
  }, []);

  const drillUp = useCallback((type) => {
    if (type === 'time') {
      setDrillPath((prev) => {
        const currentIndex = TIME_LEVELS.indexOf(prev.time);
        if (currentIndex > 0) {
          return { ...prev, time: TIME_LEVELS[currentIndex - 1] };
        }
        return prev;
      });
      setBreadcrumbs((prev) => ({
        ...prev,
        time: prev.time.length > 0 ? prev.time.slice(0, -1) : [],
      }));
    } else if (type === 'location') {
      setDrillPath((prev) => {
        const currentIndex = LOCATION_LEVELS.indexOf(prev.location);
        if (currentIndex > 0) {
          return { ...prev, location: LOCATION_LEVELS[currentIndex - 1] };
        }
        return prev;
      });
      setBreadcrumbs((prev) => ({
        ...prev,
        location: prev.location.length > 0 ? prev.location.slice(0, -1) : [],
      }));
      setSelectedProjectState(INITIAL_SELECTED_PROJECT);
    }
  }, []);

  const navigateToBreadcrumb = useCallback((type, index) => {
    if (type === 'time') {
      setDrillPath((prev) => ({ ...prev, time: TIME_LEVELS[index] }));
      setBreadcrumbs((prev) => ({ ...prev, time: prev.time.slice(0, index) }));
    } else if (type === 'location') {
      setDrillPath((prev) => ({ ...prev, location: LOCATION_LEVELS[index] }));
      setBreadcrumbs((prev) => ({ ...prev, location: prev.location.slice(0, index) }));
      setSelectedProjectState(INITIAL_SELECTED_PROJECT);
    }
  }, []);

  // ===== Project Selection (Drill-Through Only) =====
  const setSelectedProject = useCallback((projectName, district = null) => {
    setSelectedProjectState({ name: projectName, district });
  }, []);

  const clearSelectedProject = useCallback(() => {
    setSelectedProjectState(INITIAL_SELECTED_PROJECT);
  }, []);

  // ===== Derived State =====
  const activeFilters = useMemo(
    () => deriveActiveFilters(filters, breadcrumbs, drillPath),
    [filters, breadcrumbs, drillPath]
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters]
  );

  const filterKey = useMemo(
    () => generateFilterKey(activeFilters, factFilter),
    [activeFilters, factFilter]
  );

  const debouncedFilterKey = useDebouncedFilterKey(filterKey);

  // ===== Build API Params =====
  const buildApiParams = useCallback(
    (additionalParams = {}, options = {}) => {
      return buildApiParamsFromState(activeFilters, filters, factFilter, additionalParams, options);
    },
    [activeFilters, filters, factFilter]
  );

  // ===== Context Value =====
  const value = {
    // State
    filters,
    factFilter,
    drillPath,
    breadcrumbs,
    filterOptions,
    activeFilters,
    activeFilterCount,
    filterKey,
    debouncedFilterKey,
    selectedProject,

    // Time Grouping (View Context)
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
    setPropertyAgeBucket,
    setProject,
    resetFilters,

    // Drill navigation
    drillDown,
    drillUp,
    navigateToBreadcrumb,

    // Project drill-through
    setSelectedProject,
    clearSelectedProject,

    // Helpers
    buildApiParams,
  };

  return <PowerBIFilterContext.Provider value={value}>{children}</PowerBIFilterContext.Provider>;
}

export function usePowerBIFilters() {
  const context = useContext(PowerBIFilterContext);
  if (!context) {
    throw new Error('usePowerBIFilters must be used within PowerBIFilterProvider');
  }
  return context;
}

export { PowerBIFilterContext };
