/**
 * Zustand Filter Store
 *
 * Phase 3 of filter system simplification.
 *
 * Replaces PowerBIFilterProvider with a simpler Zustand store:
 * - Page-namespaced persistence (same storage pattern as Context)
 * - All actions from PowerBIFilterProvider
 * - Derived state computed on access
 * - Compatibility hooks matching existing API
 *
 * MIGRATION STATUS: Sub-Phase 3.4 (Context Removal)
 * - Phase 3.0: Store created ✓
 * - Phase 3.1: Context → Zustand sync ✓
 * - Phase 3.2: Read components migrated to Zustand ✓
 * - Phase 3.3: Write components migrated to Zustand ✓
 * - Phase 3.4: Context removal (IN PROGRESS)
 *
 * useZustandFilters is now self-contained:
 * - Gets filterOptions from DataContext (not PowerBIFilterContext)
 * - Handles route reset internally (no useRouteReset hook needed)
 * - PowerBIFilterProvider can be removed from App.jsx
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { useLocation } from 'react-router-dom';
import { useMemo, useCallback, useEffect, useRef } from 'react';

// Import debounce hook for debouncedFilterKey compatibility
// Phase 3.4: Also import useFilterOptions (gets data from DataContext, not PowerBIFilterProvider)
import { useDebouncedFilterKey, useFilterOptions } from '../context/PowerBIFilter/hooks';

// Import constants from existing filter system
import {
  INITIAL_FILTERS,
  INITIAL_FACT_FILTER,
  INITIAL_DRILL_PATH,
  INITIAL_BREADCRUMBS,
  INITIAL_SELECTED_PROJECT,
  TIME_LEVELS,
  LOCATION_LEVELS,
  DEFAULT_TIME_FILTER,
  isValidTimeFilter,
} from '../context/PowerBIFilter/constants';

// Import utilities (pure functions - no change needed)
import {
  deriveActiveFilters,
  countActiveFilters,
  generateFilterKey,
  buildApiParamsFromState,
} from '../context/PowerBIFilter/utils';

// Import storage utilities for page ID resolution
import {
  getPageIdFromPathname,
  validatePageId,
  STORAGE_VERSION,
  FALLBACK_PAGE_ID,
} from '../context/PowerBIFilter/storage';

// =============================================================================
// FEATURE FLAG
// =============================================================================

/**
 * Feature flag for gradual rollout.
 * Set VITE_ENABLE_ZUSTAND_FILTERS=true in .env to enable.
 */
export const ZUSTAND_FILTERS_ENABLED =
  import.meta.env.VITE_ENABLE_ZUSTAND_FILTERS === 'true';

// =============================================================================
// PAGE-NAMESPACED STORAGE ADAPTER
// =============================================================================

/**
 * Creates a sessionStorage adapter for Zustand persist middleware.
 * Matches existing storage key pattern: powerbi:<pageId>:<key>
 *
 * @param {string} pageId - Page identifier for namespacing
 * @returns {Object} Storage adapter with getItem, setItem, removeItem
 */
function createPageStorage(pageId) {
  const safePageId = validatePageId(pageId);
  const prefix = `powerbi:${safePageId}:zustand:`;

  return {
    getItem: (name) => {
      if (typeof window === 'undefined') return null;
      try {
        const value = sessionStorage.getItem(prefix + name);
        return value;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (typeof window === 'undefined') return;
      try {
        sessionStorage.setItem(prefix + name, value);
      } catch {
        // Ignore quota exceeded or private browsing errors
      }
    },
    removeItem: (name) => {
      if (typeof window === 'undefined') return;
      try {
        sessionStorage.removeItem(prefix + name);
      } catch {
        // Ignore errors
      }
    },
  };
}

// =============================================================================
// FILTER MIGRATION
// =============================================================================

/**
 * Migrate old filter format to new unified timeFilter format.
 *
 * Old format (pre-Phase 1):
 *   { datePreset: 'M6', dateRange: { start, end }, ... }
 *
 * New format (Phase 1+):
 *   { timeFilter: { type: 'preset', value: 'M6' }, ... }
 *   { timeFilter: { type: 'custom', start, end }, ... }
 *
 * This ensures backward compatibility when users have old filter state
 * stored in sessionStorage.
 *
 * @param {Object} savedFilters - Persisted filters from storage
 * @returns {Object} Migrated filters with valid timeFilter
 */
function migrateFilters(savedFilters) {
  if (!savedFilters || typeof savedFilters !== 'object') {
    return { ...INITIAL_FILTERS };
  }

  // Remove legacy fields regardless of path taken
  const { datePreset, dateRange, ...rest } = savedFilters;

  // If already has valid timeFilter, use it (spread onto defaults for new fields)
  if (isValidTimeFilter(savedFilters.timeFilter)) {
    return { ...INITIAL_FILTERS, ...rest, timeFilter: savedFilters.timeFilter };
  }

  // Migrate from old format or use default
  let timeFilter = DEFAULT_TIME_FILTER;

  if (datePreset && datePreset !== 'custom' && typeof datePreset === 'string') {
    // Old preset mode -> new preset mode
    timeFilter = { type: 'preset', value: datePreset };
  } else if (dateRange && (dateRange.start || dateRange.end)) {
    // Old custom mode -> new custom mode
    timeFilter = { type: 'custom', start: dateRange.start, end: dateRange.end };
  }

  return { ...INITIAL_FILTERS, ...rest, timeFilter };
}

// =============================================================================
// STORE FACTORY
// =============================================================================

/**
 * Creates a Zustand store for a specific page.
 * Each page has its own isolated store instance.
 *
 * @param {string} pageId - Page identifier for namespacing
 * @returns {Function} Zustand store hook
 */
export function createFilterStore(pageId) {
  const safePageId = validatePageId(pageId);

  return create(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // =================================================================
          // STATE
          // =================================================================

          // Meta
          pageId: safePageId,
          filtersReady: false,
          _version: STORAGE_VERSION,

          // Core filters (persisted)
          filters: { ...INITIAL_FILTERS },

          // Transient state (resets on route change, not persisted)
          factFilter: { ...INITIAL_FACT_FILTER },
          drillPath: { ...INITIAL_DRILL_PATH },
          breadcrumbs: { ...INITIAL_BREADCRUMBS },
          selectedProject: { ...INITIAL_SELECTED_PROJECT },

          // View context (persisted separately)
          timeGrouping: 'quarter',

          // =================================================================
          // DERIVED STATE (computed on access)
          // =================================================================

          /**
           * Get active filters with drill state applied.
           * Combines sidebar filters with breadcrumb overrides.
           */
          getActiveFilters: () => {
            const { filters, breadcrumbs, drillPath } = get();
            return deriveActiveFilters(filters, breadcrumbs, drillPath);
          },

          /**
           * Get count of active filters for badge display.
           */
          getActiveFilterCount: () => {
            const { filters } = get();
            return countActiveFilters(filters);
          },

          /**
           * Get stable filter key for query dependencies.
           */
          getFilterKey: () => {
            const { factFilter } = get();
            const activeFilters = get().getActiveFilters();
            return generateFilterKey(activeFilters, factFilter);
          },

          /**
           * Build API params from current state.
           * Matches PowerBIFilterProvider's buildApiParams signature.
           */
          buildApiParams: (additionalParams = {}, options = {}) => {
            const { filters, factFilter } = get();
            const activeFilters = get().getActiveFilters();
            return buildApiParamsFromState(
              activeFilters,
              filters,
              factFilter,
              additionalParams,
              options
            );
          },

          // =================================================================
          // TIME FILTER ACTIONS
          // =================================================================

          /**
           * Set time filter directly (unified format).
           */
          setTimeFilter: (timeFilter) =>
            set((state) => ({
              filters: { ...state.filters, timeFilter },
            })),

          /**
           * Set time filter to preset mode.
           */
          setTimePreset: (value) =>
            set((state) => ({
              filters: {
                ...state.filters,
                timeFilter: { type: 'preset', value },
              },
            })),

          /**
           * Set time filter to custom range mode.
           */
          setTimeRange: (start, end) =>
            set((state) => ({
              filters: {
                ...state.filters,
                timeFilter: { type: 'custom', start, end },
              },
            })),

          // Legacy aliases for backward compatibility
          setDateRange: (start, end) => get().setTimeRange(start, end),
          setDatePreset: (preset) => get().setTimePreset(preset),

          // =================================================================
          // DIMENSION FILTER ACTIONS
          // =================================================================

          setDistricts: (districts) =>
            set((state) => ({
              filters: {
                ...state.filters,
                districts: Array.isArray(districts) ? districts : [districts],
              },
            })),

          toggleDistrict: (district) =>
            set((state) => {
              const current = state.filters.districts;
              const exists = current.includes(district);
              return {
                filters: {
                  ...state.filters,
                  districts: exists
                    ? current.filter((d) => d !== district)
                    : [...current, district],
                },
              };
            }),

          setBedroomTypes: (types) =>
            set((state) => ({
              filters: {
                ...state.filters,
                bedroomTypes: Array.isArray(types) ? types : [types],
              },
            })),

          toggleBedroomType: (type) =>
            set((state) => {
              const current = state.filters.bedroomTypes;
              const exists = current.includes(type);
              return {
                filters: {
                  ...state.filters,
                  bedroomTypes: exists
                    ? current.filter((t) => t !== type)
                    : [...current, type],
                },
              };
            }),

          setSegments: (segments) =>
            set((state) => ({
              filters: {
                ...state.filters,
                segments: Array.isArray(segments) ? segments : [segments],
              },
            })),

          toggleSegment: (segment) =>
            set((state) => {
              const current = state.filters.segments;
              const exists = current.includes(segment);
              return {
                filters: {
                  ...state.filters,
                  segments: exists
                    ? current.filter((s) => s !== segment)
                    : [...current, segment],
                },
              };
            }),

          setSaleType: (saleType) =>
            set((state) => ({
              filters: { ...state.filters, saleType },
            })),

          setTenure: (tenure) =>
            set((state) => ({
              filters: { ...state.filters, tenure },
            })),

          setProject: (project) =>
            set((state) => ({
              filters: { ...state.filters, project },
            })),

          // =================================================================
          // RANGE FILTER ACTIONS
          // =================================================================

          setPsfRange: (min, max) =>
            set((state) => ({
              filters: { ...state.filters, psfRange: { min, max } },
            })),

          setSizeRange: (min, max) =>
            set((state) => ({
              filters: { ...state.filters, sizeRange: { min, max } },
            })),

          setPropertyAge: (min, max) =>
            set((state) => ({
              filters: { ...state.filters, propertyAge: { min, max } },
            })),

          setPropertyAgeBucket: (bucket) =>
            set((state) => ({
              filters: { ...state.filters, propertyAgeBucket: bucket },
            })),

          // =================================================================
          // FACT FILTER ACTIONS
          // =================================================================

          setFactPriceRange: (min, max) =>
            set((state) => ({
              factFilter: { ...state.factFilter, priceRange: { min, max } },
            })),

          // =================================================================
          // DRILL NAVIGATION ACTIONS
          // =================================================================

          /**
           * Drill down into a dimension.
           */
          drillDown: (type, value, label) =>
            set((state) => {
              const levels = type === 'time' ? TIME_LEVELS : LOCATION_LEVELS;
              const currentLevel = state.drillPath[type];
              const currentIndex = levels.indexOf(currentLevel);

              // Can't drill deeper than max level
              if (currentIndex >= levels.length - 1) return state;

              const nextLevel = levels[currentIndex + 1];
              const breadcrumbEntry = { value, label: label || value };

              return {
                drillPath: { ...state.drillPath, [type]: nextLevel },
                breadcrumbs: {
                  ...state.breadcrumbs,
                  [type]: [...state.breadcrumbs[type], breadcrumbEntry],
                },
              };
            }),

          /**
           * Drill up one level.
           */
          drillUp: (type) =>
            set((state) => {
              const levels = type === 'time' ? TIME_LEVELS : LOCATION_LEVELS;
              const currentLevel = state.drillPath[type];
              const currentIndex = levels.indexOf(currentLevel);

              // Can't drill up from top level
              if (currentIndex <= 0) return state;

              const prevLevel = levels[currentIndex - 1];

              return {
                drillPath: { ...state.drillPath, [type]: prevLevel },
                breadcrumbs: {
                  ...state.breadcrumbs,
                  [type]: state.breadcrumbs[type].slice(0, -1),
                },
              };
            }),

          /**
           * Navigate to a specific breadcrumb index.
           */
          navigateToBreadcrumb: (type, index) =>
            set((state) => {
              const levels = type === 'time' ? TIME_LEVELS : LOCATION_LEVELS;

              // index 0 = root level (no breadcrumbs)
              // index 1 = first drill level, etc.
              const targetLevel = levels[index] || levels[0];

              return {
                drillPath: { ...state.drillPath, [type]: targetLevel },
                breadcrumbs: {
                  ...state.breadcrumbs,
                  [type]: state.breadcrumbs[type].slice(0, index),
                },
              };
            }),

          // =================================================================
          // PROJECT SELECTION (DRILL-THROUGH)
          // =================================================================

          setSelectedProject: (name, district = null) =>
            set({ selectedProject: { name, district } }),

          clearSelectedProject: () =>
            set({ selectedProject: { ...INITIAL_SELECTED_PROJECT } }),

          // =================================================================
          // VIEW CONTEXT ACTIONS
          // =================================================================

          setTimeGrouping: (timeGrouping) => set({ timeGrouping }),

          // =================================================================
          // LIFECYCLE ACTIONS
          // =================================================================

          /**
           * Mark filters as ready (hydration complete).
           */
          hydrate: () => set({ filtersReady: true }),

          /**
           * Reset all filters to initial state.
           */
          resetFilters: () =>
            set({
              filters: { ...INITIAL_FILTERS },
              factFilter: { ...INITIAL_FACT_FILTER },
              drillPath: { ...INITIAL_DRILL_PATH },
              breadcrumbs: { ...INITIAL_BREADCRUMBS },
              selectedProject: { ...INITIAL_SELECTED_PROJECT },
            }),

          /**
           * Reset only transient state (on route change).
           */
          resetTransient: () =>
            set({
              factFilter: { ...INITIAL_FACT_FILTER },
              drillPath: { ...INITIAL_DRILL_PATH },
              breadcrumbs: { ...INITIAL_BREADCRUMBS },
              selectedProject: { ...INITIAL_SELECTED_PROJECT },
            }),
        }),

        // Persist configuration
        {
          name: 'filters',
          storage: createPageStorage(safePageId),
          version: STORAGE_VERSION,
          // Only persist these fields (transient state excluded)
          partialize: (state) => ({
            filters: state.filters,
            timeGrouping: state.timeGrouping,
            _version: state._version,
          }),
          // Handle version migration
          // Always migrate filters to ensure timeFilter shape is valid, even at same version
          // (old shapes can exist at same version depending on deployment timing)
          migrate: (persistedState, version) => {
            const next = persistedState ?? {};
            const migratedFilters = migrateFilters(next.filters);

            if (version !== STORAGE_VERSION) {
              console.warn(
                `[filterStore] Version mismatch: stored=${version}, current=${STORAGE_VERSION}. Migrating.`
              );
              return {
                ...next,
                filters: migratedFilters,
                timeGrouping: next.timeGrouping ?? 'quarter',
                _version: STORAGE_VERSION,
              };
            }

            // Same version: ensure shape correctness
            return {
              ...next,
              filters: migratedFilters,
              _version: STORAGE_VERSION,
            };
          },
          // Mark as hydrated after rehydration
          onRehydrateStorage: () => (state) => {
            if (state) {
              state.hydrate();
            }
          },
        }
      )
    )
  );
}

// =============================================================================
// STORE CACHE (One store per page)
// =============================================================================

const storeCache = new Map();

/**
 * Get or create a filter store for a specific page.
 *
 * @param {string} pageId - Page identifier
 * @returns {Function} Zustand store hook
 */
export function getFilterStore(pageId) {
  const safePageId = validatePageId(pageId);

  if (!storeCache.has(safePageId)) {
    storeCache.set(safePageId, createFilterStore(safePageId));
  }

  return storeCache.get(safePageId);
}

/**
 * Clear store cache (for testing).
 */
export function clearStoreCache() {
  storeCache.clear();
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Get page ID from current route.
 * Must be used within React Router context.
 * Falls back to FALLBACK_PAGE_ID in test environments without Router.
 */
export function usePageId() {
  // Try to get location from React Router
  // Falls back to default if not in Router context (e.g., unit tests)
  let pathname = '/';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const location = useLocation();
    pathname = location?.pathname || '/';
  } catch {
    // No Router context (e.g., unit tests) - use fallback
    pathname = '/';
  }

  return useMemo(
    () => getPageIdFromPathname(pathname),
    [pathname]
  );
}

/**
 * Main hook to access filter store for current page.
 * Returns the full Zustand store API.
 *
 * Usage:
 * ```jsx
 * const store = useFilterStore();
 * const filters = store.filters;
 * store.setTimePreset('Y1');
 * ```
 */
export function useFilterStore() {
  const pageId = usePageId();
  const store = getFilterStore(pageId);
  // Return bound store instance
  return store();
}

/**
 * Hook to access filter store with selector.
 * Use for performance optimization.
 *
 * Usage:
 * ```jsx
 * const filters = useFilterStoreSelector(state => state.filters);
 * ```
 */
export function useFilterStoreSelector(selector) {
  const pageId = usePageId();
  const store = getFilterStore(pageId);
  return store(selector);
}

// =============================================================================
// COMPATIBILITY HOOKS (Match PowerBIFilter API)
// =============================================================================

/**
 * Compatibility hook matching useFilterState from PowerBIFilterProvider.
 * Use during migration to minimize code changes.
 *
 * NOTE: During Phase 3.0-3.1, this still reads from Context.
 * Will switch to Zustand in Phase 3.2.
 */
export function useZustandFilterState() {
  const store = useFilterStore();

  return useMemo(
    () => ({
      pageId: store.pageId,
      filtersReady: store.filtersReady,
      filters: store.filters,
      factFilter: store.factFilter,
      drillPath: store.drillPath,
      breadcrumbs: store.breadcrumbs,
      selectedProject: store.selectedProject,
      timeGrouping: store.timeGrouping,
      // Derived state
      activeFilters: store.getActiveFilters(),
      activeFilterCount: store.getActiveFilterCount(),
      filterKey: store.getFilterKey(),
      // Helper function
      buildApiParams: store.buildApiParams,
    }),
    [store]
  );
}

/**
 * Compatibility hook matching useFilterActions from PowerBIFilterProvider.
 * Actions are stable - this hook never causes re-renders.
 */
export function useZustandFilterActions() {
  const store = useFilterStore();

  // Actions are stable, so we can return them directly without useMemo
  return {
    // Time filter
    setTimeFilter: store.setTimeFilter,
    setTimePreset: store.setTimePreset,
    setTimeRange: store.setTimeRange,
    setDateRange: store.setDateRange,
    setDatePreset: store.setDatePreset,
    // Dimensions
    setDistricts: store.setDistricts,
    toggleDistrict: store.toggleDistrict,
    setBedroomTypes: store.setBedroomTypes,
    toggleBedroomType: store.toggleBedroomType,
    setSegments: store.setSegments,
    toggleSegment: store.toggleSegment,
    setSaleType: store.setSaleType,
    setTenure: store.setTenure,
    setProject: store.setProject,
    // Ranges
    setPsfRange: store.setPsfRange,
    setSizeRange: store.setSizeRange,
    setPropertyAge: store.setPropertyAge,
    setPropertyAgeBucket: store.setPropertyAgeBucket,
    // Fact filter
    setFactPriceRange: store.setFactPriceRange,
    // Drill navigation
    drillDown: store.drillDown,
    drillUp: store.drillUp,
    navigateToBreadcrumb: store.navigateToBreadcrumb,
    // Project selection
    setSelectedProject: store.setSelectedProject,
    clearSelectedProject: store.clearSelectedProject,
    // View context
    setTimeGrouping: store.setTimeGrouping,
    // Lifecycle
    resetFilters: store.resetFilters,
    resetTransient: store.resetTransient,
  };
}

/**
 * Full compatibility hook matching usePowerBIFilters from Context.
 *
 * PHASE 3.2: This hook provides the same interface as usePowerBIFilters(),
 * allowing charts to migrate by simply changing their import.
 *
 * Includes:
 * - All state values (filters, drillPath, breadcrumbs, etc.)
 * - All derived values (activeFilters, filterKey, debouncedFilterKey)
 * - All actions (setTimePreset, setDistricts, drillDown, etc.)
 * - buildApiParams helper function
 *
 * Usage (drop-in replacement for usePowerBIFilters):
 * ```jsx
 * // Before:
 * import { usePowerBIFilters } from '../context/PowerBIFilter';
 * const { buildApiParams, debouncedFilterKey, filterKey, timeGrouping } = usePowerBIFilters();
 *
 * // After:
 * import { useZustandFilters } from '../stores';
 * const { buildApiParams, debouncedFilterKey, filterKey, timeGrouping } = useZustandFilters();
 * ```
 */
export function useZustandFilters() {
  const store = useFilterStore();

  // Get current pathname for route reset detection
  // Falls back to '/' in test environments without Router
  let pathname = '/';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const location = useLocation();
    pathname = location?.pathname || '/';
  } catch {
    // No Router context (tests) - use fallback
  }
  const prevPathnameRef = useRef(pathname);

  // Phase 3.4: Get filterOptions from DataContext via useFilterOptions hook
  // This doesn't require PowerBIFilterProvider - it uses DataContext directly
  const [filterOptions] = useFilterOptions();

  // Phase 3.4: Route reset - reset transient state when navigating to different page
  // This replaces the useRouteReset hook from PowerBIFilterProvider
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      // Reset transient state (drillPath, breadcrumbs, factFilter, selectedProject)
      store.resetTransient();
    }
  }, [pathname, store]);

  // Compute derived state
  const activeFilters = store.getActiveFilters();
  const activeFilterCount = store.getActiveFilterCount();
  const filterKey = store.getFilterKey();

  // Apply debouncing to filterKey (matches Context behavior)
  const debouncedFilterKey = useDebouncedFilterKey(filterKey);

  // Stable buildApiParams function
  const buildApiParams = useCallback(
    (additionalParams = {}, options = {}) => {
      return store.buildApiParams(additionalParams, options);
    },
    [store]
  );

  // Return full interface matching usePowerBIFilters
  return useMemo(
    () => ({
      // === State ===
      pageId: store.pageId,
      filtersReady: store.filtersReady,
      filters: store.filters,
      factFilter: store.factFilter,
      drillPath: store.drillPath,
      breadcrumbs: store.breadcrumbs,
      selectedProject: store.selectedProject,
      timeGrouping: store.timeGrouping,

      // === Filter Options (from Context - API metadata) ===
      filterOptions,

      // === Derived State ===
      activeFilters,
      activeFilterCount,
      filterKey,
      debouncedFilterKey,

      // === Actions (Time Filter) ===
      setTimeFilter: store.setTimeFilter,
      setTimePreset: store.setTimePreset,
      setTimeRange: store.setTimeRange,
      setDateRange: store.setDateRange,
      setDatePreset: store.setDatePreset,

      // === Actions (Dimensions) ===
      setDistricts: store.setDistricts,
      toggleDistrict: store.toggleDistrict,
      setBedroomTypes: store.setBedroomTypes,
      toggleBedroomType: store.toggleBedroomType,
      setSegments: store.setSegments,
      toggleSegment: store.toggleSegment,
      setSaleType: store.setSaleType,
      setTenure: store.setTenure,
      setProject: store.setProject,

      // === Actions (Ranges) ===
      setPsfRange: store.setPsfRange,
      setSizeRange: store.setSizeRange,
      setPropertyAge: store.setPropertyAge,
      setPropertyAgeBucket: store.setPropertyAgeBucket,

      // === Actions (Drill Navigation) ===
      drillDown: store.drillDown,
      drillUp: store.drillUp,
      navigateToBreadcrumb: store.navigateToBreadcrumb,

      // === Actions (Project Selection) ===
      setSelectedProject: store.setSelectedProject,
      clearSelectedProject: store.clearSelectedProject,

      // === Actions (View Context) ===
      setTimeGrouping: store.setTimeGrouping,

      // === Actions (Lifecycle) ===
      resetFilters: store.resetFilters,

      // === Helper Functions ===
      buildApiParams,
    }),
    [
      store,
      filterOptions,
      activeFilters,
      activeFilterCount,
      filterKey,
      debouncedFilterKey,
      buildApiParams,
    ]
  );
}

// =============================================================================
// DEBUG UTILITIES (Dev only)
// =============================================================================

/**
 * Get all cached stores (for DevTools/debugging).
 */
export function getStoreCacheForDebug() {
  if (import.meta.env.DEV) {
    return Object.fromEntries(storeCache);
  }
  return {};
}

/**
 * Log current filter state (dev only).
 */
export function logFilterState(pageId) {
  if (import.meta.env.DEV) {
    const store = getFilterStore(pageId);
    const state = store.getState();
    console.group(`[filterStore] ${pageId}`);
    console.log('filters:', state.filters);
    console.log('activeFilters:', state.getActiveFilters());
    console.log('filterKey:', state.getFilterKey());
    console.log('drillPath:', state.drillPath);
    console.log('breadcrumbs:', state.breadcrumbs);
    console.groupEnd();
  }
}
