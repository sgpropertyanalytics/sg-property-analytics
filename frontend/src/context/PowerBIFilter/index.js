/**
 * PowerBI Filter Context - Module Exports
 *
 * This module provides Power BI-style filter state management for the dashboard.
 *
 * Module Structure:
 * - constants.js: Initial state and constants
 * - deriveActiveFilters.js: Pure functions for filter derivation
 * - buildApiParams.js: API parameter building
 * - useFilterOptions.js: Filter options loading hook
 * - useRouteReset.js: Route change reset hook
 * - useDebouncedFilterKey.js: Debounced filter key hook
 * - PowerBIFilterProvider.jsx: Main provider component
 */

// Main exports
export {
  PowerBIFilterProvider,
  usePowerBIFilters,
  PowerBIFilterContext,
} from './PowerBIFilterProvider';

// Constants
export { TIME_GROUP_BY } from './constants';

// For advanced usage - pure functions
export { deriveActiveFilters, countActiveFilters, generateFilterKey } from './deriveActiveFilters';
export { buildApiParamsFromState } from './buildApiParams';

// For advanced usage - hooks
export { useFilterOptions } from './useFilterOptions';
export { useRouteReset } from './useRouteReset';
export { useDebouncedFilterKey } from './useDebouncedFilterKey';
