import { useState, useEffect, useCallback, useRef } from 'react';
import { useStaleRequestGuard } from './useStaleRequestGuard';

/**
 * useAbortableQuery - Safe async data fetching with abort and stale protection
 *
 * This hook enforces the institutional-grade async pattern:
 * - Automatic AbortController cancellation on filter changes
 * - Stale request detection (requestId tracking)
 * - CanceledError/AbortError never treated as real errors
 * - No state updates after unmount
 * - Loading/error/data state management
 *
 * RULE: "No component may call fetch or axios directly.
 *        All async data loading must go through useAbortableQuery or useStaleRequestGuard."
 *
 * Usage:
 * ```jsx
 * // Simple usage with dependency-based refetch
 * const { data, loading, error, refetch } = useAbortableQuery(
 *   async (signal) => {
 *     const response = await apiClient.get('/api/data', { signal, params });
 *     return response.data;
 *   },
 *   [filterKey, localDrillLevel]  // Dependencies that trigger refetch
 * );
 *
 * // With options
 * const { data, loading, error } = useAbortableQuery(
 *   fetchFunction,
 *   dependencies,
 *   {
 *     enabled: someCondition,  // Skip fetch if false
 *     initialData: [],         // Initial data before first fetch
 *     onSuccess: (data) => {}, // Callback on success
 *     onError: (err) => {},    // Callback on error (excludes abort)
 *   }
 * );
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch (like useEffect deps)
 * @param {Object} options - Optional configuration
 * @returns {Object} { data, loading, error, refetch }
 */
export function useAbortableQuery(queryFn, deps = [], options = {}) {
  const {
    enabled = true,
    initialData = null,
    onSuccess,
    onError,
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const mountedRef = useRef(true);

  // Track mounted state to prevent updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const executeQuery = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const requestId = startRequest();
    const signal = getSignal();

    setLoading(true);
    setError(null);

    try {
      const result = await queryFn(signal);

      // Guard 1: Check if request is stale (newer request started)
      if (isStale(requestId)) return;

      // Guard 2: Check if component is still mounted
      if (!mountedRef.current) return;

      setData(result);
      setLoading(false);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      // This prevents "Failed to load" flash when switching tabs rapidly
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }

      // Guard: Check stale after error too
      if (isStale(requestId)) return;
      if (!mountedRef.current) return;

      setError(err);
      setLoading(false);

      if (onError) {
        onError(err);
      }
    }
  }, [queryFn, enabled, startRequest, getSignal, isStale, onSuccess, onError]);

  // Execute query when dependencies change
  useEffect(() => {
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return {
    data,
    loading,
    error,
    refetch: executeQuery,
  };
}

/**
 * isAbortError - Check if an error is an abort/cancel error
 *
 * Use this in catch blocks when manually handling fetch:
 * ```jsx
 * catch (err) {
 *   if (isAbortError(err)) return;  // Ignore abort
 *   setError(err);
 * }
 * ```
 */
export function isAbortError(err) {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
}

export default useAbortableQuery;
