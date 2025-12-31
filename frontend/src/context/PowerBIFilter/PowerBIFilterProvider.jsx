/**
 * PowerBI-style Filter State Management
 *
 * PERFORMANCE OPTIMIZATION: Split into 3 contexts to reduce re-renders
 * - FilterStateContext: State values that change (filters, drillPath, etc.)
 * - FilterActionsContext: Stable callbacks that never change
 * - FilterOptionsContext: Filter options from API (changes rarely)
 *
 * This prevents charts that only need actions from re-rendering when state changes.
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

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Storage utilities for page-namespaced persistence
import {
  getPageIdFromPathname,
  validatePageId,
  readFilterStorage,
  writeFilterStorage,
  clearPageNamespace,
  markHydrated,
  isHydrated,
  STORAGE_KEYS,
  FALLBACK_PAGE_ID,
} from './storage';

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

// Split contexts for performance optimization
const FilterStateContext = createContext(null);
const FilterActionsContext = createContext(null);
const FilterOptionsContext = createContext(null);

// Legacy combined context for backward compatibility
const PowerBIFilterContext = createContext(null);

export function PowerBIFilterProvider({ children, pageId: explicitPageId }) {
  // ===== Page Identification =====
  // Derive page ID from route for namespaced storage
  // Each page has isolated filter state - selections don't leak across routes
  // GUARDRAIL: Always validate pageId to prevent undefined/empty keys
  const location = useLocation();
  const rawPageId = explicitPageId || getPageIdFromPathname(location.pathname);
  const pageId = validatePageId(rawPageId) || FALLBACK_PAGE_ID;
  const prevPageIdRef = useRef(pageId);

  // ===== Hydration Guard =====
  // Prevents double-fetch flicker by tracking if filters have been restored
  // filtersReady = false until initial hydration completes
  const [filtersReady, setFiltersReady] = useState(() => {
    // If already hydrated this session, we're ready immediately
    return isHydrated(pageId);
  });

  // ===== Core State =====
  // Filters persist to page-namespaced sessionStorage
  const [filters, setFilters] = useState(() => {
    const saved = readFilterStorage(pageId, STORAGE_KEYS.FILTERS, null);
    if (saved) {
      // Merge with INITIAL_FILTERS to handle any new fields added after save
      return { ...INITIAL_FILTERS, ...saved };
    }
    return INITIAL_FILTERS;
  });

  // Mark hydration complete after initial render
  useEffect(() => {
    if (!filtersReady) {
      markHydrated(pageId);
      setFiltersReady(true);
    }
  }, [pageId, filtersReady]);

  // Reset filters when navigating to a different page
  // This ensures each page starts fresh with its own stored state
  useEffect(() => {
    if (prevPageIdRef.current !== pageId) {
      prevPageIdRef.current = pageId;
      // Load filters for the new page (or reset to initial if none stored)
      const savedFilters = readFilterStorage(pageId, STORAGE_KEYS.FILTERS, null);
      setFilters(savedFilters ? { ...INITIAL_FILTERS, ...savedFilters } : INITIAL_FILTERS);
      // Check if new page was already hydrated
      setFiltersReady(isHydrated(pageId));
      if (!isHydrated(pageId)) {
        markHydrated(pageId);
        setFiltersReady(true);
      }
    }
  }, [pageId]);

  // These states do NOT persist - they reset on route change (handled by useRouteReset)
  const [factFilter, setFactFilter] = useState(INITIAL_FACT_FILTER);
  const [drillPath, setDrillPath] = useState(INITIAL_DRILL_PATH);
  const [selectedProject, setSelectedProjectState] = useState(INITIAL_SELECTED_PROJECT);
  const [breadcrumbs, setBreadcrumbs] = useState(INITIAL_BREADCRUMBS);

  // ===== Time Grouping (View Context) =====
  // Uses page-namespaced sessionStorage
  const [timeGrouping, setTimeGroupingState] = useState(() => {
    return readFilterStorage(pageId, STORAGE_KEYS.TIME_GROUPING, 'quarter');
  });

  const setTimeGrouping = useCallback((val) => {
    setTimeGroupingState(val);
    writeFilterStorage(pageId, STORAGE_KEYS.TIME_GROUPING, val);
  }, [pageId]);

  // ===== Filter Persistence (sessionStorage) =====
  // Sync filters to page-namespaced sessionStorage whenever they change
  useEffect(() => {
    writeFilterStorage(pageId, STORAGE_KEYS.FILTERS, filters);
  }, [pageId, filters]);

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
    // Clear all storage for this page namespace
    clearPageNamespace(pageId);
    // Reset in-memory state
    setFilters(INITIAL_FILTERS);
    setBreadcrumbs(INITIAL_BREADCRUMBS);
    // Note: useEffect will sync INITIAL_FILTERS to sessionStorage automatically
  }, [pageId]);

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

  // ===== Split Context Values for Performance =====
  // Separating state, actions, and options reduces re-renders significantly.
  // Components can now subscribe only to what they need.

  // State context - changes frequently, triggers re-renders in state consumers
  const stateValue = useMemo(
    () => ({
      pageId,
      filtersReady,
      filters,
      factFilter,
      drillPath,
      breadcrumbs,
      activeFilters,
      activeFilterCount,
      filterKey,
      debouncedFilterKey,
      selectedProject,
      timeGrouping,
      buildApiParams,
    }),
    [
      pageId,
      filtersReady,
      filters,
      factFilter,
      drillPath,
      breadcrumbs,
      activeFilters,
      activeFilterCount,
      filterKey,
      debouncedFilterKey,
      selectedProject,
      timeGrouping,
      buildApiParams,
    ]
  );

  // Actions context - stable callbacks, never triggers re-renders
  const actionsValue = useMemo(
    () => ({
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
      drillDown,
      drillUp,
      navigateToBreadcrumb,
      setSelectedProject,
      clearSelectedProject,
      setTimeGrouping,
    }),
    // Empty deps - all callbacks are stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Options context - changes rarely (only on initial load or refresh)
  const optionsValue = useMemo(
    () => ({ filterOptions }),
    [filterOptions]
  );

  // Legacy combined value for backward compatibility with usePowerBIFilters
  const legacyValue = useMemo(
    () => ({
      // State
      pageId,
      filtersReady,
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

      // Actions
      setTimeGrouping,
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
      drillDown,
      drillUp,
      navigateToBreadcrumb,
      setSelectedProject,
      clearSelectedProject,

      // Helpers
      buildApiParams,
    }),
    [
      pageId,
      filtersReady,
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
      buildApiParams,
    ]
  );

  return (
    <FilterStateContext.Provider value={stateValue}>
      <FilterActionsContext.Provider value={actionsValue}>
        <FilterOptionsContext.Provider value={optionsValue}>
          <PowerBIFilterContext.Provider value={legacyValue}>
            {children}
          </PowerBIFilterContext.Provider>
        </FilterOptionsContext.Provider>
      </FilterActionsContext.Provider>
    </FilterStateContext.Provider>
  );
}

// ===== Hooks =====

/**
 * Legacy hook - returns all state and actions
 * Use for backward compatibility; prefer targeted hooks for new code
 */
export function usePowerBIFilters() {
  const context = useContext(PowerBIFilterContext);
  if (!context) {
    throw new Error('usePowerBIFilters must be used within PowerBIFilterProvider');
  }
  return context;
}

/**
 * State-only hook - re-renders when filter state changes
 * Use when you need: filters, drillPath, activeFilters, filterKey, etc.
 */
export function useFilterState() {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState must be used within PowerBIFilterProvider');
  }
  return context;
}

/**
 * Actions-only hook - NEVER re-renders (stable callbacks)
 * Use when you only need: setDateRange, resetFilters, drillDown, etc.
 */
export function useFilterActions() {
  const context = useContext(FilterActionsContext);
  if (!context) {
    throw new Error('useFilterActions must be used within PowerBIFilterProvider');
  }
  return context;
}

/**
 * Options-only hook - re-renders only when filter options change (rare)
 * Use when you only need: filterOptions
 */
export function useFilterOptionsContext() {
  const context = useContext(FilterOptionsContext);
  if (!context) {
    throw new Error('useFilterOptionsContext must be used within PowerBIFilterProvider');
  }
  return context;
}

export { PowerBIFilterContext, FilterStateContext, FilterActionsContext, FilterOptionsContext };
