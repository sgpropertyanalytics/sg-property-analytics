import React from 'react';
import { ChartSkeleton } from './ChartSkeleton';
import { ErrorState } from './ErrorState';
import { TechOverlay } from './loading';
import { getQueryErrorMessage } from './QueryState';
import { useAppReadyOptional } from '../../context/AppReadyContext';

/**
 * ChartFrame - Unified wrapper for chart loading states with Schematic pattern
 *
 * Design Philosophy: "Wireframe & Scan" (Analyst Aesthetic)
 * - Initial load: Schematic wireframe skeleton with scanner animation
 * - Refreshing: Tech overlay with calibration bars (data visible underneath)
 *
 * Status-based rendering:
 * - idle: Placeholder (user disabled query)
 * - pending/loading: Schematic skeleton (wireframe blueprint)
 * - refreshing: Tech overlay with progress bar (has prior data)
 * - success: Chart content (or empty state if data is empty)
 * - error: Error state
 *
 * Boot gating: isBootPending takes priority (schematic skeleton during app boot)
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
 * @param {string} skeleton - Skeleton type: 'bar'|'line'|'pie'|'grid'|'table'|'map'|'default'
 * @param {number} height - Fixed height for overlay and chart container
 * @param {number} staggerIndex - Cascade delay index for waterfall reveal (0=first, 1=+50ms, etc.)
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
  skeleton = 'default', // Schematic skeleton type
  height = 300,
  staggerIndex = 0, // Cascade delay index for waterfall reveal
  children,
}) {
  // CENTRAL BOOT GATING: Use publicReady by default (matches useAppQuery default)
  // Charts that need subscription resolution should use RequirePro wrapper
  const appReadyContext = useAppReadyOptional();
  const publicReady = appReadyContext?.publicReady ?? true;

  // Boot pending if explicit prop OR context says boot isn't complete
  const isBootPending = isBootPendingProp || !publicReady;

  // === BOOT PENDING: Show schematic skeleton ===
  if (isBootPending) {
    return <ChartSkeleton type={skeleton} height={height} />;
  }

  // === STATUS-BASED RENDERING (preferred) ===
  if (status) {
    switch (status) {
      case 'idle':
        // Disabled by user (not boot pending) - show neutral placeholder
        return (
          <div
            className="flex items-center justify-center text-sm text-brand-blue font-mono uppercase tracking-wider"
            style={{ minHeight: height }}
          >
            Select filters to load data.
          </div>
        );

      case 'pending':
      case 'loading':
        // Show schematic skeleton during initial load (wireframe blueprint)
        return <ChartSkeleton type={skeleton} height={height} />;

      case 'error':
        return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;

      case 'refreshing':
        // Safety check: If somehow refreshing with no data, show skeleton
        if (empty) {
          return <ChartSkeleton type={skeleton} height={height} />;
        }
        // Has prior data, fetching update - show tech overlay with content visible
        return (
          <TechOverlay
            visible
            height={height}
            showSpinner
            showProgress
            isRefreshing
            staggerIndex={staggerIndex}
            message="UPDATING"
          >
            {children}
          </TechOverlay>
        );

      case 'success':
        // ONLY show empty state when status === 'success' AND data is empty
        if (empty) {
          // If actively filtering, show tech overlay on empty state
          if (isFiltering) {
            return (
              <TechOverlay
                visible
                height={height}
                showSpinner={false}
                showProgress
                isRefreshing
                staggerIndex={staggerIndex}
                message="FILTERING"
              >
                <div
                  className="flex items-center justify-center text-sm text-brand-blue font-mono uppercase tracking-wider"
                  style={{ minHeight: height }}
                >
                  No data for selected filters.
                </div>
              </TechOverlay>
            );
          }
          return (
            <div
              className="flex items-center justify-center text-sm text-brand-blue font-mono uppercase tracking-wider"
              style={{ minHeight: height }}
            >
              No data for selected filters.
            </div>
          );
        }
        // Success with data - render chart (check isFiltering for tech overlay)
        if (isFiltering) {
          return (
            <TechOverlay
              visible
              height={height}
              showSpinner={false}
              showProgress
              isRefreshing
              staggerIndex={staggerIndex}
              message="FILTERING"
            >
              {children}
            </TechOverlay>
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
    return <ChartSkeleton type={skeleton} height={height} />;
  }

  // Initial load
  if (loading && !isUpdating) {
    return <ChartSkeleton type={skeleton} height={height} />;
  }

  // Error state
  if (error) {
    return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;
  }

  // Empty state (legacy - less safe, kept for backward compat)
  if (empty && !loading && !isUpdating && !isPendingProp) {
    return (
      <div
        className="flex items-center justify-center text-sm text-brand-blue font-mono uppercase tracking-wider"
        style={{ minHeight: height }}
      >
        No data for selected filters.
      </div>
    );
  }

  // Success state with optional updating overlay (tech style)
  if (isUpdating) {
    return (
      <TechOverlay
        visible
        height={height}
        showSpinner={false}
        showProgress
        isRefreshing
        staggerIndex={staggerIndex}
        message="UPDATING"
      >
        {children}
      </TechOverlay>
    );
  }

  return (
    <div className="relative" style={{ minHeight: height }}>
      {children}
    </div>
  );
});

export default ChartFrame;
