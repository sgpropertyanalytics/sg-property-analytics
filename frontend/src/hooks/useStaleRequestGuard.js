import { useRef, useCallback } from 'react';

/**
 * useStaleRequestGuard - Prevents stale API responses from overwriting fresh data
 *
 * When filter changes trigger multiple rapid API calls, slower responses may
 * return after faster ones. This hook provides two levels of protection:
 *
 * 1. **Stale Detection (isStale)**: Lightweight check to ignore responses from
 *    older requests. The request still completes on the network.
 *
 * 2. **Request Cancellation (signal)**: AbortController signal that actually
 *    cancels the in-flight HTTP request, saving bandwidth and server resources.
 *
 * Usage:
 * ```jsx
 * const { startRequest, isStale, getSignal } = useStaleRequestGuard();
 *
 * useEffect(() => {
 *   const requestId = startRequest();
 *   const signal = getSignal();
 *
 *   const fetchData = async () => {
 *     try {
 *       // Pass signal to axios for actual request cancellation
 *       const response = await api.getData({ signal });
 *       if (isStale(requestId)) return; // Double-check (signal may have raced)
 *       setData(response.data);
 *     } catch (err) {
 *       // Ignore abort errors - they're expected when request is cancelled
 *       if (err.name === 'CanceledError' || err.name === 'AbortError') return;
 *       if (isStale(requestId)) return;
 *       setError(err);
 *     }
 *   };
 *
 *   fetchData();
 * }, [filterKey]);
 * ```
 *
 * @returns {Object} { startRequest, isStale, getSignal }
 */
export function useStaleRequestGuard() {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  // Start a new request: increment ID and create new AbortController
  // Also aborts any previous in-flight request
  const startRequest = useCallback(() => {
    // Abort previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    // Increment request ID
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  // Check if a request ID is stale (newer request has started)
  const isStale = useCallback((requestId) => {
    return requestId !== requestIdRef.current;
  }, []);

  // Get the current AbortController's signal for axios
  const getSignal = useCallback(() => {
    return abortControllerRef.current?.signal;
  }, []);

  // Abort current in-flight request and null the controller
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return { startRequest, isStale, getSignal, abort };
}

export default useStaleRequestGuard;
