import { useQuery, QueryStatus, isAbortError as _isAbortError } from './useQuery';

/**
 * useAbortableQuery - Safe async data fetching with abort and stale protection
 *
 * @deprecated Use useQuery directly for status-based state management.
 * This wrapper exists for backward compatibility.
 *
 * PR1 MIGRATION:
 * - New `status` field provides explicit state (idle/pending/loading/refreshing/success/error)
 * - New `isPending` field for skeleton during boot/filter transitions
 * - `loading` now means "in-flight with no prior data" (not "pending or loading")
 * - For skeleton: use `isPending || loading` instead of just `loading`
 *
 * Usage:
 * ```jsx
 * const { data, loading, error, status, isPending } = useAbortableQuery(
 *   async (signal) => apiClient.get('/api/data', { signal }),
 *   [filterKey]
 * );
 *
 * // For ChartFrame, pass status:
 * <ChartFrame status={status} ... />
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch
 * @param {Object} options - Optional configuration
 * @returns {Object} Query state with both legacy and new status-based fields
 */
export function useAbortableQuery(queryFn, deps = [], options = {}) {
  const result = useQuery(queryFn, deps, options);

  // Return all fields from useQuery (includes status, isPending, etc.)
  // plus keep backward compat structure
  return result;
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

// Re-export QueryStatus for consumers
export { QueryStatus };

export default useAbortableQuery;
