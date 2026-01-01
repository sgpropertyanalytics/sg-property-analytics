/**
 * Supply Data Context
 *
 * Provides shared supply data to all components on the Supply Insights page.
 * CRITICAL FIX: Eliminates 4 duplicate API calls to /api/supply/summary.
 *
 * Before: 4 components each called getSupplySummary independently
 * After: Single fetch shared via context
 *
 * Components that consume this context:
 * - SupplyKpiCards
 * - SupplyWaterfallChart (regional view)
 * - SupplyWaterfallChart (district view)
 * - SupplyBreakdownTable
 */

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useGatedAbortableQuery } from '../hooks';
import { getSupplySummary } from '../api/client';

// Context for supply data
const SupplyDataContext = createContext(null);

/**
 * Supply Data Provider
 *
 * Wraps the Supply Insights page and provides shared data to all children.
 *
 * @param {Object} props
 * @param {boolean} props.includeGls - Whether to include GLS pipeline data
 * @param {number} props.launchYear - Year filter for upcoming launches
 * @param {React.ReactNode} props.children - Child components
 */
export function SupplyDataProvider({
  includeGls = true,
  launchYear = 2026,
  children,
}) {
  // Build filter key for cache/refetch
  const filterKey = useMemo(
    () => `supply:${includeGls}:${launchYear}`,
    [includeGls, launchYear]
  );

  // Track if filters are changing (for blur effect)
  const [debouncedFilterKey, setDebouncedFilterKey] = useState(filterKey);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilterKey(filterKey), 300);
    return () => clearTimeout(timer);
  }, [filterKey]);
  const isFiltering = filterKey !== debouncedFilterKey;

  // Single shared fetch for all supply data - gated on appReady
  // isBootPending = true while waiting for app boot (auth/subscription/filters)
  const { data, loading, error, isBootPending, isFetching, refetch } = useGatedAbortableQuery(
    async (signal) => {
      return getSupplySummary(
        { includeGls, launchYear },
        { signal }
      );
    },
    [filterKey],
    { initialData: null, keepPreviousData: true }
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      data,
      loading,
      error,
      isBootPending,
      isFetching,
      isFiltering,
      refetch,
      // Pass through filter values so components know the current state
      includeGls,
      launchYear,
    }),
    [data, loading, error, isBootPending, isFetching, isFiltering, refetch, includeGls, launchYear]
  );

  return (
    <SupplyDataContext.Provider value={contextValue}>
      {children}
    </SupplyDataContext.Provider>
  );
}

/**
 * Hook to access shared supply data
 *
 * @returns {Object} Supply data context value:
 *   - data: Raw API response
 *   - loading: Boolean loading state
 *   - error: Error object if fetch failed
 *   - refetch: Function to manually refetch
 *   - includeGls: Current includeGls filter value
 *   - launchYear: Current launchYear filter value
 *
 * @throws {Error} If used outside of SupplyDataProvider
 */
export function useSupplyData() {
  const context = useContext(SupplyDataContext);

  if (context === null) {
    throw new Error(
      'useSupplyData must be used within a SupplyDataProvider. ' +
        'Wrap your component tree with <SupplyDataProvider>.'
    );
  }

  return context;
}

export default SupplyDataProvider;
