/**
 * PowerBI Filter Context
 *
 * RE-EXPORT MODULE: This file re-exports from ./PowerBIFilter/ for backwards compatibility.
 * New code should import directly from './context/PowerBIFilter'.
 *
 * Module Structure (in ./PowerBIFilter/):
 * - constants.js: Initial state and constants
 * - deriveActiveFilters.js: Pure functions for filter derivation
 * - buildApiParams.js: API parameter building
 * - useFilterOptions.js: Filter options loading hook
 * - useRouteReset.js: Route change reset hook
 * - useDebouncedFilterKey.js: Debounced filter key hook
 * - PowerBIFilterProvider.jsx: Main provider component
 */

// Re-export everything from the modular structure
export {
  PowerBIFilterProvider,
  usePowerBIFilters,
  PowerBIFilterContext,
  TIME_GROUP_BY,
} from './PowerBIFilter';
