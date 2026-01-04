/**
 * PowerBI Filter - Utilities Module
 *
 * Phase 4: PowerBIFilterProvider removed. Filter state now lives in Zustand.
 * This module now only exports:
 * - Constants (TIME_GROUP_BY, etc.)
 * - Pure utility functions (deriveActiveFilters, countActiveFilters)
 * - Hooks (useFilterOptions)
 * - Storage utilities (page-namespaced persistence)
 *
 * For filter state, use: import { useZustandFilters } from '../stores';
 */

// Constants
export { TIME_GROUP_BY } from './constants';

// For advanced usage - pure functions
export {
  deriveActiveFilters,
  countActiveFilters,
} from './utils';

// For advanced usage - hooks
export { useFilterOptions } from './hooks';

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
