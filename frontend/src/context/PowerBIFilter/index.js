/**
 * PowerBI Filter Context - Module Exports
 *
 * This module provides Power BI-style filter state management for the dashboard.
 *
 * Module Structure (4 files):
 * - constants.js: Initial state and constants
 * - utils.js: Pure functions (deriveActiveFilters, buildApiParams, etc.)
 * - hooks.js: React hooks (useFilterOptions, useRouteReset, useDebouncedFilterKey)
 * - PowerBIFilterProvider.jsx: Main provider component
 */

// Main exports
export {
  PowerBIFilterProvider,
  usePowerBIFilters,
  PowerBIFilterContext,
  // New targeted hooks for performance optimization
  useFilterState,
  useFilterActions,
  useFilterOptionsContext,
  FilterStateContext,
  FilterActionsContext,
  FilterOptionsContext,
} from './PowerBIFilterProvider';

// Constants
export { TIME_GROUP_BY } from './constants';

// For advanced usage - pure functions
export {
  deriveActiveFilters,
  countActiveFilters,
  generateFilterKey,
  buildApiParamsFromState,
} from './utils';

// For advanced usage - hooks
export { useFilterOptions, useRouteReset, useDebouncedFilterKey } from './hooks';

// Storage utilities for page-namespaced persistence
export {
  // Constants
  STORAGE_VERSION,
  FALLBACK_PAGE_ID,
  STORAGE_KEYS,
  // Page ID resolution
  getPageIdFromPathname,
  validatePageId,
  getFilterStorageKey,
  // Read/Write
  readFilterStorage,
  writeFilterStorage,
  // Version management
  checkStorageVersion,
  // Hydration
  markHydrated,
  isHydrated,
  // Clear operations
  clearFilterStorage,
  clearPageNamespace,
} from './storage';
