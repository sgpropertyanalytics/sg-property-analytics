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

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

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

// Session storage key for filter persistence
// Uses sessionStorage so filters reset when browser tab closes (not localStorage)
const FILTERS_STORAGE_KEY = 'powerbi_filters';

export function PowerBIFilterProvider({ children }) {
  // ===== Core State =====
  // Filters persist to sessionStorage (survives navigation, clears on tab close)
  const [filters, setFilters] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // Merge with INITIAL_FILTERS to handle any new fields added after save
          return { ...INITIAL_FILTERS, ...parsed };
        }
      } catch {
        // Ignore parse errors, use defaults
      }
    }
    return INITIAL_FILTERS;
  });

  // These states do NOT persist - they reset on route change (handled by useRouteReset)
  const [factFilter, setFactFilter] = useState(INITIAL_FACT_FILTER);
  const [drillPath, setDrillPath] = useState(INITIAL_DRILL_PATH);
  const [selectedProject, setSelectedProjectState] = useState(INITIAL_SELECTED_PROJECT);
  const [breadcrumbs, setBreadcrumbs] = useState(INITIAL_BREADCRUMBS);

  // ===== Time Grouping (View Context) =====
  // Uses sessionStorage to reset on browser close (session-scoped)
  const [timeGrouping, setTimeGroupingState] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('user_time_pref') || 'quarter';
    }
    return 'quarter';
  });

  const setTimeGrouping = useCallback((val) => {
    setTimeGroupingState(val);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('user_time_pref', val);
    }
  }, []);

  // ===== Filter Persistence (sessionStorage) =====
  // Sync filters to sessionStorage whenever they change
  // This enables persistence across page navigation within the same session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
      } catch {
        // Ignore storage errors (quota exceeded, private browsing)
      }
    }
  }, [filters]);

  // ===== Filter Options (from API) =====
  const [filterOptions] = useFilterOptions();

  // ===== Route Change Reset =====
  // Batch reset function - single state update to prevent flicker
  // Uses a ref to track if we need to reset, then batches all updates together
  const batchReset = useCallback(() => {
    // React 18 batches these automatically in callbacks, but we make it explicit
    // by setting all state in a single synchronous block
    setDrillPath(INITIAL_DRILL_PATH);
    setBreadcrumbs(INITIAL_BREADCRUMBS);
    setFactFilter(INITIAL_FACT_FILTER);
    setSelectedProjectState(INITIAL_SELECTED_PROJECT);
  }, []);

  useRouteReset({
    setDrillPath,
    setBreadcrumbs,
    setFactFilter,
    setSelectedProject: setSelectedProjectState,
    batchReset, // Pass batch reset for single-update navigation
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
    // Note: useEffect will sync INITIAL_FILTERS to sessionStorage automatically
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

  // ===== Context Value (Memoized to prevent unnecessary re-renders) =====
  // PERF FIX: Only state in deps - callbacks are stable via useCallback
  // Including callbacks in deps caused context value recreation on every render,
  // triggering re-renders in ALL consumers even when only one filter changed.

  const value = useMemo(
    () => ({
      // State (changes trigger re-render - this is expected)
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

      // Filter setters (stable callbacks via useCallback)
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

      // Drill navigation (stable callbacks)
      drillDown,
      drillUp,
      navigateToBreadcrumb,

      // Project drill-through (stable callbacks)
      setSelectedProject,
      clearSelectedProject,

      // Helpers (stable callback - deps are activeFilters, filters, factFilter)
      buildApiParams,
    }),
    [
      // ONLY state values - callbacks are stable and don't need to be deps
      // This prevents context value recreation when callbacks haven't changed
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
      timeGrouping,
      // buildApiParams included because it depends on activeFilters/filters/factFilter
      // and we want consumers to get the updated function when those change
      buildApiParams,
    ]
  );

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
