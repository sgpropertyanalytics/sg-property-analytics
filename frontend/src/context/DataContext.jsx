/**
 * DataContext - Centralized state management for static/shared data
 * 
 * This context provides:
 * - List of available districts (fetched once)
 * - Metadata about the API (health status, row counts, etc.)
 * - Shared configuration constants
 * 
 * Prevents redundant API calls by fetching static data once at the app level.
 */
import { createContext, useContext, useState, useEffect } from 'react';
import { getDistricts, getMetadata } from '../api/client';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [availableDistricts, setAvailableDistricts] = useState([]);
  const [apiMetadata, setApiMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch static data once on mount
  useEffect(() => {
    const fetchStaticData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch districts and metadata in parallel
        const [districtsRes, metadataRes] = await Promise.all([
          getDistricts().catch(() => ({ data: { districts: [] } })),
          getMetadata().catch(() => ({ data: null }))
        ]);

        setAvailableDistricts(districtsRes.data.districts || []);
        setApiMetadata(metadataRes.data);
      } catch (err) {
        console.error('Error fetching static data:', err);
        setError(err.message);
        // Set empty defaults on error
        setAvailableDistricts([]);
        setApiMetadata(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStaticData();
  }, []); // Only fetch once on mount

  const value = {
    // Data
    availableDistricts,
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

