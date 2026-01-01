/**
 * TanStack Query Client Configuration
 *
 * Production-grade defaults for data fetching across the app.
 * Replaces custom useQuery/useAbortableQuery/useGatedAbortableQuery hooks.
 *
 * Phase 2 of filter system simplification - provides:
 * - Automatic cache key generation (no manual filterKey)
 * - Built-in request deduplication
 * - Stale-while-revalidate pattern
 * - DevTools integration
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * Query Client instance with production-ready defaults.
 *
 * Configuration rationale:
 * - staleTime: 30s - Data is fresh for 30s, prevents rapid refetches on filter changes
 * - gcTime: 5min - Keep cached data for 5min (allows back-nav without refetch)
 * - retry: 1 - One retry on failure (API client handles 401 retries separately)
 * - refetchOnWindowFocus: false - Don't refetch on tab focus (dashboard data changes slowly)
 * - refetchOnReconnect: true - Refetch when network reconnects (stale data likely)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // === Caching ===
      // Data considered fresh for 30 seconds
      // During this window, TanStack returns cached data instantly
      // This acts as a "debounce" - rapid filter changes hit cache, not network
      staleTime: 30_000,

      // Keep unused query data in cache for 5 minutes
      // Allows instant back-navigation without refetch
      gcTime: 5 * 60_000,

      // === Retry ===
      // Single retry on failure (network glitches happen)
      // 401 retries are handled by axios interceptor in client.js
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),

      // === Refetch Behavior ===
      // Don't refetch on window focus - dashboard data doesn't change that fast
      // Users can manually refresh if needed
      refetchOnWindowFocus: false,

      // Do refetch on network reconnect - data is likely stale after disconnect
      refetchOnReconnect: true,

      // Don't refetch on component mount if data is fresh
      refetchOnMount: true,

      // === Error Handling ===
      // Don't throw errors to error boundaries
      // Let components handle their own error states
      throwOnError: false,

      // === Network Mode ===
      // Always attempt network requests (offline support not needed for dashboard)
      networkMode: 'always',
    },
    mutations: {
      // Mutations retry once on failure
      retry: 1,
      retryDelay: 1000,
    },
  },
});

/**
 * Query Status enum for compatibility with existing ChartFrame component.
 * Maps TanStack Query states to our existing status values.
 *
 * TanStack v5 status model:
 * - isPending: No cached data (first load or cache cleared)
 * - isFetching: Currently fetching (may or may not have cached data)
 * - isSuccess: Query succeeded
 * - isError: Query failed
 *
 * Our existing status model (used by ChartFrame):
 * - IDLE: Query disabled
 * - PENDING: Enabled but hasn't started (maps to isPending)
 * - LOADING: Fetching with no data (skeleton)
 * - REFRESHING: Fetching with existing data (blur overlay)
 * - SUCCESS: Has data
 * - ERROR: Has error
 */
export const QueryStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  LOADING: 'loading',
  REFRESHING: 'refreshing',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Derive our status from TanStack Query state.
 *
 * This function maps TanStack's status model to our existing ChartFrame-compatible status.
 * Critical for backward compatibility during migration.
 *
 * @param {Object} queryResult - Result from useQuery hook
 * @param {boolean} enabled - Whether query is enabled (for IDLE detection)
 * @param {boolean} hasData - Whether we have real data (not just initialData: [])
 * @returns {string} One of QueryStatus values
 */
export function deriveQueryStatus(queryResult, enabled, hasData) {
  const { isPending, isFetching, isError, isSuccess } = queryResult;

  // Query disabled = IDLE
  if (!enabled) {
    return QueryStatus.IDLE;
  }

  // Error state takes precedence
  if (isError) {
    return QueryStatus.ERROR;
  }

  // First load - no cached data, fetching
  if (isPending && isFetching) {
    return QueryStatus.LOADING;
  }

  // Has cached data and refetching - show blur overlay, not skeleton
  if (!isPending && isFetching && hasData) {
    return QueryStatus.REFRESHING;
  }

  // Fetching but no real data yet (initialData: [] case)
  if (isFetching && !hasData) {
    return QueryStatus.LOADING;
  }

  // Pending but not fetching (shouldn't happen normally)
  if (isPending) {
    return QueryStatus.PENDING;
  }

  // Success
  if (isSuccess) {
    return QueryStatus.SUCCESS;
  }

  // Fallback
  return QueryStatus.PENDING;
}

/**
 * Check if data is "real" (not just initialData: [] or {})
 *
 * Used for status derivation - empty arrays/objects should show LOADING, not REFRESHING.
 * This prevents "Updating..." with "0 periods" state.
 *
 * @param {*} data - Query data to check
 * @returns {boolean} True if data is non-empty
 */
export function hasRealData(data) {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') {
    // Only check keys for plain objects; treat class instances as "has data"
    const isPlainObject = data.constructor === Object;
    return isPlainObject ? Object.keys(data).length > 0 : true;
  }
  return true;
}

export default queryClient;
