/**
 * Stores Index
 *
 * Central export point for all Zustand stores.
 * Phase 4: Filter migration complete. Context removed.
 */

// Filter Store
export {
  // Feature flag
  ZUSTAND_FILTERS_ENABLED,
  // Store factory
  createFilterStore,
  getFilterStore,
  clearStoreCache,
  // Hooks
  usePageId,
  useFilterStore,
  useFilterStoreSelector,
  // Compatibility hooks (match PowerBIFilter API)
  useZustandFilters,
  useZustandFilterState,
  useZustandFilterActions,
  // Debug utilities
  getStoreCacheForDebug,
  logFilterState,
} from './filterStore';
