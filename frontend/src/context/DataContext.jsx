/**
 * DataContext - Centralized state management for static/shared data
 *
 * This context provides:
 * - Full normalized filter options (fetched once, shared across app)
 * - Metadata about the API (health status, row counts, etc.)
 * - Shared configuration constants
 *
 * Prevents redundant API calls by fetching static data once at the app level.
 * All filter option consumers should use this context instead of fetching independently.
 *
 * MIGRATION: Phase 2 - Uses useAppQuery instead of useEffect+useState (CLAUDE.md Rule 9)
 */
import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFilterOptions, getMetadata } from '../api/client';
import { normalizeFilterOptions } from '../schemas/apiContract';

const DataContext = createContext(null);

// Default filter options (used during loading)
const DEFAULT_FILTER_OPTIONS = {
  districts: [],
  regions: [],
  bedrooms: [],
  saleTypes: [],
  tenures: [],
  marketSegments: [],
  propertyAgeBuckets: [],
  dateRange: { min: null, max: null },
  psfRange: { min: null, max: null },
  sizeRange: { min: null, max: null },
  districtsRaw: [],
  regionsLegacy: null,
};

export function DataProvider({ children }) {
  // Fetch static data using TanStack Query directly (no boot gating)
  // Filter options are app metadata - must load immediately, not wait for auth
  // NOTE: Don't use useAppQuery here - it gates on publicReady which creates circular dependency
  const { data, status, error } = useQuery({
    queryKey: ['staticData'],
    queryFn: async () => {
      // Don't pass signal - prevents abort during React StrictMode double-render
      const [filterOptionsRes, metadataRes] = await Promise.all([
        getFilterOptions({ priority: 'high' }),
        getMetadata({ priority: 'high' }).catch(() => ({ data: null }))
      ]);

      const normalized = normalizeFilterOptions(filterOptionsRes.data);

      return {
        filterOptions: {
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
        },
        apiMetadata: metadataRes.data,
      };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Derive values from query result
  const filterOptions = data?.filterOptions ?? DEFAULT_FILTER_OPTIONS;
  const apiMetadata = data?.apiMetadata ?? null;
  const loading = status === 'pending';

  // Derive availableDistricts from filterOptions for backward compatibility
  const availableDistricts = filterOptions.districtsRaw || [];

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // Full filter options (normalized)
    filterOptions: {
      ...filterOptions,
      loading,
      error: error?.message ?? null,
    },

    // Legacy: district list for backward compatibility
    availableDistricts,

    // Metadata
    apiMetadata,

    // State
    loading,
    error: error?.message ?? null,

    // Helpers
    isDataReady: status === 'success' && availableDistricts.length > 0,
  }), [filterOptions, availableDistricts, apiMetadata, loading, error, status]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

/**
 * Custom hook to access DataContext
 * 
 * Usage:
 *   const { availableDistricts, apiMetadata, loading } = useData();
 */
export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

export default DataContext;
