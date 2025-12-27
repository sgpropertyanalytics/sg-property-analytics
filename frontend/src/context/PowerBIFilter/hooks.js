/**
 * PowerBI Filter Hooks
 *
 * Reusable hooks for filter state management.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getFilterOptions } from '../../api/client';
import { normalizeFilterOptions } from '../../schemas/apiContract';
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
 * Hook to load filter options from API.
 * @returns {[Object, Function]} [filterOptions, setFilterOptions]
 */
export function useFilterOptions() {
  const [filterOptions, setFilterOptions] = useState(INITIAL_FILTER_OPTIONS);

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await getFilterOptions();
        const normalized = normalizeFilterOptions(response.data);

        setFilterOptions({
          districts: normalized.districts,
          regions: normalized.regions,
          bedrooms: normalized.bedrooms,
          saleTypes: normalized.saleTypes,
          tenures: normalized.tenures,
          marketSegments: normalized.marketSegments,
          propertyAgeBuckets: normalized.propertyAgeBuckets || [],
          dateRange: normalized.dateRange,
          psfRange: normalized.psfRange,
          sizeRange: normalized.sizeRange,
          districtsRaw: normalized.districtsRaw,
          regionsLegacy: normalized.regionsLegacy,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('Error loading filter options:', err);
        setFilterOptions((prev) => ({ ...prev, loading: false, error: err.message }));
      }
    };
    loadFilterOptions();
  }, []);

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
}) {
  const location = useLocation();
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (previousPathnameRef.current !== location.pathname) {
      previousPathnameRef.current = location.pathname;
      setDrillPath(INITIAL_DRILL_PATH);
      setBreadcrumbs(INITIAL_BREADCRUMBS);
      setFactFilter(INITIAL_FACT_FILTER);
      setSelectedProject(INITIAL_SELECTED_PROJECT);
    }
  }, [location.pathname, setDrillPath, setBreadcrumbs, setFactFilter, setSelectedProject]);
}

// =============================================================================
// DEBOUNCED FILTER KEY HOOK
// =============================================================================

/**
 * Hook to create a debounced version of the filter key.
 * Delays effect triggers by 200ms when users click multiple filters quickly.
 *
 * @param {string} filterKey - The current filter key
 * @param {number} delay - Debounce delay in ms (default: 200)
 * @returns {string} Debounced filter key
 */
export function useDebouncedFilterKey(filterKey, delay = 200) {
  const [debouncedFilterKey, setDebouncedFilterKey] = useState(filterKey);
  const debounceTimeoutRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDebouncedFilterKey(filterKey);
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedFilterKey(filterKey);
    }, delay);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [filterKey, delay]);

  return debouncedFilterKey;
}
