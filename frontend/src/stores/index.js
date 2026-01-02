/**
 * Stores Index
 *
 * Central export point for all Zustand stores.
 * Part of Phase 3 filter system simplification.
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

// DevTools (dev only)
export { FilterStoreDevTools } from './FilterStoreDevTools';
