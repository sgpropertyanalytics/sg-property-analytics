import { useRef, useCallback } from 'react';

/**
 * useStaleRequestGuard - Prevents stale API responses from overwriting fresh data
 *
 * When filter changes trigger multiple rapid API calls, slower responses may
 * return after faster ones. This hook tracks request sequence numbers and
 * provides a guard to ignore stale responses.
 *
 * Usage:
 * ```jsx
 * const { startRequest, isStale } = useStaleRequestGuard();
 *
 * useEffect(() => {
 *   const requestId = startRequest();
 *
 *   const fetchData = async () => {
 *     try {
 *       const response = await api.getData();
 *       if (isStale(requestId)) return; // Newer request started, ignore
 *       setData(response.data);
 *     } catch (err) {
 *       if (isStale(requestId)) return;
 *       setError(err);
 *     }
 *   };
 *
 *   fetchData();
 * }, [filterKey]);
 * ```
 *
 * @returns {Object} { startRequest, isStale }
 */
export function useStaleRequestGuard() {
  const requestIdRef = useRef(0);

  // Start a new request and return its ID
  const startRequest = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  // Check if a request ID is stale (newer request has started)
  const isStale = useCallback((requestId) => {
    return requestId !== requestIdRef.current;
  }, []);

  return { startRequest, isStale };
}

export default useStaleRequestGuard;
