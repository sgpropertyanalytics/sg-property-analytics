import React from 'react';
import { ChartSkeleton } from './ChartSkeleton';
import { ErrorState } from './ErrorState';
import { UpdateIndicator } from './UpdateIndicator';
import { getQueryErrorMessage } from './QueryState';

/**
 * ChartFrame - Unified wrapper for chart loading states with "Retain and Blur" pattern
 *
 * Handles all chart states:
 * - Initial loading: Shows skeleton (fixed height, no layout jump)
 * - Error: Shows error state with retry
 * - Empty: Shows empty state message (only after load completes)
 * - Updating (isFetching/isFiltering): Blurs content + shows indicator
 * - Success: Shows chart content
 *
 * Key behavior: When filters change, the chart stays visible but dimmed with
 * an "Updating..." overlay. This provides immediate visual feedback (within 50ms)
 * that the user's action was registered.
 *
 * @param {boolean} loading - True on initial data load (no data yet)
 * @param {boolean} isFetching - True during background refetch (from useAbortableQuery)
 * @param {boolean} isFiltering - True when filters changed but not debounced yet
 * @param {Error} error - Error object if request failed
 * @param {Function} onRetry - Callback for retry button
 * @param {boolean} empty - True if data is empty after successful load
 * @param {string} skeleton - Skeleton type: 'bar', 'line', 'pie', 'grid', 'table', 'map'
 * @param {number} height - Fixed height for skeleton and chart container
 * @param {React.ReactNode} children - Chart content to render
 */
export const ChartFrame = React.memo(function ChartFrame({
  loading,
  isFetching = false,
  isFiltering = false,
  error,
  onRetry,
  empty,
  skeleton,
  height = 300,
  children,
}) {
  // Calculate updating state - true if either fetching or filters just changed
  const isUpdating = isFetching || isFiltering;

  // Initial load - show skeleton (only when we have no data at all)
  // If isUpdating is true, we have previous data to show, so skip skeleton
  if (loading && !isUpdating) {
    if (skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <div className="p-3 text-sm text-[#547792]">Loading...</div>;
  }

  // Error state
  if (error) {
    return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;
  }

  // Empty state - only show if we have finished loading and data is empty
  // Critical: Don't show empty state while updating (user might think filters failed)
  if (empty && !loading && !isUpdating) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[#547792]"
        style={{ minHeight: height }}
      >
        No data for selected filters.
      </div>
    );
  }

  // Success state (with optional updating overlay)
  return (
    <div className="relative" style={{ minHeight: height }}>
      {/* Chart content - blurred when updating */}
      <div
        className={`
          transition-all duration-150
          ${isUpdating ? 'opacity-60 blur-[1px]' : ''}
        `}
      >
        {children}
      </div>

      {/* Update indicator overlay - positioned above chart */}
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <UpdateIndicator />
        </div>
      )}
    </div>
  );
});

export default ChartFrame;
