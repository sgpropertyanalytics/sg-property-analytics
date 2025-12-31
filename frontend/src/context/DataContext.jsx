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
 */
import { createContext, useContext, useState, useEffect } from 'react';
import { getFilterOptions, getMetadata } from '../api/client';
import { normalizeFilterOptions } from '../schemas/apiContract';

const DataContext = createContext(null);

// Initial filter options state (matches PowerBIFilter/constants.js)
const INITIAL_FILTER_OPTIONS = {
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
  loading: true,
  error: null,
};

export function DataProvider({ children }) {
  const [filterOptions, setFilterOptions] = useState(INITIAL_FILTER_OPTIONS);
  const [apiMetadata, setApiMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch static data once on mount
  useEffect(() => {
    const fetchStaticData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch filter options and metadata in parallel
        const [filterOptionsRes, metadataRes] = await Promise.all([
          getFilterOptions({ priority: 'high' }).catch(() => ({ data: {} })),
          getMetadata({ priority: 'high' }).catch(() => ({ data: null }))
        ]);

        // Normalize filter options using shared adapter
        const normalized = normalizeFilterOptions(filterOptionsRes.data);

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
        setApiMetadata(metadataRes.data);
      } catch (err) {
        console.error('Error fetching static data:', err);
        setError(err.message);
        setFilterOptions(prev => ({ ...prev, loading: false, error: err.message }));
        setApiMetadata(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStaticData();
  }, []); // Only fetch once on mount

  // Derive availableDistricts from filterOptions for backward compatibility
  const availableDistricts = filterOptions.districtsRaw || [];

  const value = {
    // Full filter options (normalized)
    filterOptions,

    // Legacy: district list for backward compatibility
    availableDistricts,

    // Metadata
    apiMetadata,

    // State
    loading,
    error,

    // Helpers
    isDataReady: !loading && availableDistricts.length > 0,
  };

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
