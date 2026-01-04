/**
 * PowerBI Filter Hooks
 *
 * Reusable hooks for filter state management.
 */

import { useState } from 'react';
import { useData } from '../DataContext';
import { INITIAL_FILTER_OPTIONS } from './constants';

// =============================================================================
// FILTER OPTIONS HOOK
// =============================================================================

/**
 * Hook to get filter options from DataContext.
 * No longer fetches independently - uses centralized data from DataProvider.
 * This eliminates duplicate /api/filter-options calls.
 *
 * @returns {[Object, Function]} [filterOptions, setFilterOptions]
 */
export function useFilterOptions() {
  const { filterOptions: contextFilterOptions } = useData();

  // Local state for any component-level overrides (rare)
  const [localOverrides, setLocalOverrides] = useState(null);

  // Merge context data with local overrides if any
  const filterOptions = localOverrides || contextFilterOptions || INITIAL_FILTER_OPTIONS;

  // setFilterOptions allows local overrides but shouldn't be commonly used
  const setFilterOptions = (updater) => {
    if (typeof updater === 'function') {
      setLocalOverrides(prev => updater(prev || filterOptions));
    } else {
      setLocalOverrides(updater);
    }
  };

  return [filterOptions, setFilterOptions];
}

