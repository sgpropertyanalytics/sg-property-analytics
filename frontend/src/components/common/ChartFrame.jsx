import React from 'react';
import { ChartSkeleton } from './ChartSkeleton';
import { ErrorState } from './ErrorState';
import { UpdateIndicator } from './UpdateIndicator';
import { getQueryErrorMessage } from './QueryState';
import { useAppReadyOptional } from '../../context/AppReadyContext';

/**
 * ChartFrame - Unified wrapper for chart loading states with "Retain and Blur" pattern
 *
 * PR1 FIX: Now supports `status` prop from useQuery for correct state handling.
 * Empty state shows ONLY when status === 'success' && empty.
 *
 * Status-based rendering (preferred):
 * - idle: Placeholder (user disabled query)
 * - pending: Skeleton (enabled but request not started - THE GAP KILLER)
 * - loading: Skeleton (request in-flight, no prior data)
 * - refreshing: Blur overlay (request in-flight, has prior data)
 * - success: Chart content (or empty state if data is empty)
 * - error: Error state
 *
 * Boot gating: isBootPending takes priority (skeleton during app boot)
 *
 * @param {string} status - Query status from useQuery: 'idle'|'pending'|'loading'|'refreshing'|'success'|'error'
 * @param {boolean} loading - Legacy: True on initial data load (fallback if status not provided)
 * @param {boolean} isFetching - Legacy: True during background refetch
 * @param {boolean} isPending - Legacy: True when enabled but not started (fallback if status not provided)
 * @param {boolean} isFiltering - True when filters changed but not debounced yet
 * @param {boolean} isBootPending - True when app is still booting (from useGatedAbortableQuery)
 * @param {Error} error - Error object if request failed
 * @param {Function} onRetry - Callback for retry button
 * @param {boolean} empty - True if data is empty after successful load
 * @param {string} skeleton - Skeleton type: 'bar', 'line', 'pie', 'grid', 'table', 'map'
 * @param {number} height - Fixed height for skeleton and chart container
 * @param {React.ReactNode} children - Chart content to render
 */
export const ChartFrame = React.memo(function ChartFrame({
  status,
  loading,
  isFetching = false,
  isPending: isPendingProp = false,
  isFiltering = false,
  isBootPending: isBootPendingProp = false,
  error,
  onRetry,
  empty,
  skeleton,
  height = 300,
  children,
}) {
  // CENTRAL BOOT GATING: Automatically check appReady from context
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Boot pending if explicit prop OR context says boot isn't complete
  const isBootPending = isBootPendingProp || !appReady;

  // === BOOT PENDING: Always show skeleton ===
  if (isBootPending) {
    if (skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <div className="p-3 text-sm text-[#547792]">Loading...</div>;
  }

  // === STATUS-BASED RENDERING (preferred) ===
  if (status) {
    switch (status) {
      case 'idle':
        // Disabled by user (not boot pending) - show neutral placeholder
        return (
          <div
            className="flex items-center justify-center text-sm text-[#547792]"
            style={{ minHeight: height }}
          >
            Select filters to load data.
          </div>
        );

      case 'pending':
      case 'loading':
        // THE GAP KILLER: Show skeleton during pending (enabled but not started)
        if (skeleton) {
          return <ChartSkeleton type={skeleton} height={height} />;
        }
        return <div className="p-3 text-sm text-[#547792]">Loading...</div>;

      case 'error':
        return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;

      case 'refreshing':
        // Safety check: If somehow refreshing with no data, show skeleton instead of blur
        // This prevents "Updating..." with "0 periods" state
        if (empty) {
          if (skeleton) {
            return <ChartSkeleton type={skeleton} height={height} />;
          }
          return <div className="p-3 text-sm text-[#547792]">Loading...</div>;
        }
        // Has prior data, fetching update - show blur overlay
        return (
          <div className="relative" style={{ minHeight: height }}>
            <div className="transition-all duration-150 opacity-60 blur-[1px]">
              {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <UpdateIndicator />
            </div>
          </div>
        );

      case 'success':
        // ONLY show empty state when status === 'success' AND data is empty
        if (empty) {
          // If actively filtering, show updating overlay on empty state
          // This prevents jarring "No data" flash during filter transitions
          if (isFiltering) {
            return (
              <div className="relative" style={{ minHeight: height }}>
                <div className="transition-all duration-150 opacity-60 blur-[1px] flex items-center justify-center text-sm text-[#547792]" style={{ minHeight: height }}>
                  No data for selected filters.
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <UpdateIndicator />
                </div>
              </div>
            );
          }
          return (
            <div
              className="flex items-center justify-center text-sm text-[#547792]"
              style={{ minHeight: height }}
            >
              No data for selected filters.
            </div>
          );
        }
        // Success with data - render chart (check isFiltering for overlay)
        if (isFiltering) {
          return (
            <div className="relative" style={{ minHeight: height }}>
              <div className="transition-all duration-150 opacity-60 blur-[1px]">
                {children}
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <UpdateIndicator />
              </div>
            </div>
          );
        }
        return (
          <div className="relative" style={{ minHeight: height }}>
            {children}
          </div>
        );

      default:
        // Unknown status - fall through to legacy rendering
        break;
    }
  }

  // === LEGACY RENDERING (backward compat when status not provided) ===
  // Calculate updating state
  const isUpdating = isFetching || isFiltering;

  // Pending state (from isPending prop)
  if (isPendingProp) {
    if (skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <div className="p-3 text-sm text-[#547792]">Loading...</div>;
  }

  // Initial load
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

  // Empty state (legacy - less safe, kept for backward compat)
  if (empty && !loading && !isUpdating && !isPendingProp) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[#547792]"
        style={{ minHeight: height }}
      >
        No data for selected filters.
      </div>
    );
  }

  // Success state with optional updating overlay
  return (
    <div className="relative" style={{ minHeight: height }}>
      <div
        className={`
          transition-all duration-150
          ${isUpdating ? 'opacity-60 blur-[1px]' : ''}
        `}
      >
        {children}
      </div>
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <UpdateIndicator />
        </div>
      )}
    </div>
  );
});

export default ChartFrame;
