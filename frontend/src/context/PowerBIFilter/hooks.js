/**
 * PowerBI Filter Hooks
 *
 * Reusable hooks for filter state management.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '../DataContext';
import {
  INITIAL_FILTER_OPTIONS,
  INITIAL_DRILL_PATH,
  INITIAL_BREADCRUMBS,
  INITIAL_FACT_FILTER,
  INITIAL_SELECTED_PROJECT,
} from './constants';

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

// =============================================================================
// ROUTE RESET HOOK
// =============================================================================

/**
 * Hook to reset state on route changes.
 * @param {Object} setters - State setter functions
 */
export function useRouteReset({
  setDrillPath,
  setBreadcrumbs,
  setFactFilter,
  setSelectedProject,
  // New: single batch reset function for better performance
  batchReset,
}) {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== location.pathname) {
      previousPathnameRef.current = location.pathname;

      // Use batch reset if available (single state update = single re-render)
      if (batchReset) {
        batchReset();
      } else {
        // Fallback to individual setters (4 state updates = potential flicker)
        setDrillPath(INITIAL_DRILL_PATH);
        setBreadcrumbs(INITIAL_BREADCRUMBS);
        setFactFilter(INITIAL_FACT_FILTER);
        setSelectedProject(INITIAL_SELECTED_PROJECT);
      }
    }
  }, [location.pathname, setDrillPath, setBreadcrumbs, setFactFilter, setSelectedProject, batchReset]);
}

