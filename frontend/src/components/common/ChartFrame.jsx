import React from 'react';
import { ChartSkeleton } from './ChartSkeleton';
import { ErrorState } from './ErrorState';
import { FrostOverlay } from './loading';
import { getQueryErrorMessage } from './QueryState';
import { useAppReadyOptional } from '../../context/AppReadyContext';

/**
 * ChartFrame - Unified wrapper for chart loading states with Frost Overlay pattern
 *
 * Uses glassmorphism frost overlay for loading states instead of skeleton placeholders.
 * Provides smooth de-blur transitions when data arrives.
 *
 * Status-based rendering:
 * - idle: Placeholder (user disabled query)
 * - pending/loading: Frost overlay with spinner (initial load)
 * - refreshing: Light frost with progress bar (has prior data)
 * - success: Chart content (or empty state if data is empty)
 * - error: Error state
 *
 * Boot gating: isBootPending takes priority (frost overlay during app boot)
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
 * @param {string} skeleton - Skeleton type (kept for backward compat, ignored in frost mode)
 * @param {boolean} useSkeleton - Force legacy skeleton mode instead of frost overlay
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
  skeleton,
  useSkeleton = false, // Set to true to use legacy skeleton mode
  height = 300,
  staggerIndex = 0, // Cascade delay index for waterfall reveal
  children,
}) {
  // CENTRAL BOOT GATING: Automatically check appReady from context
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Boot pending if explicit prop OR context says boot isn't complete
  const isBootPending = isBootPendingProp || !appReady;

  // === BOOT PENDING: Show frost overlay (or skeleton if useSkeleton) ===
  if (isBootPending) {
    if (useSkeleton && skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <FrostOverlay height={height} showSpinner showProgress staggerIndex={staggerIndex} />;
  }

  // === STATUS-BASED RENDERING (preferred) ===
  if (status) {
    switch (status) {
      case 'idle':
        // Disabled by user (not boot pending) - show neutral placeholder
        return (
          <div
            className="flex items-center justify-center text-sm text-brand-blue"
            style={{ minHeight: height }}
          >
            Select filters to load data.
          </div>
        );

      case 'pending':
      case 'loading':
        // Show frost overlay during initial load (or skeleton if useSkeleton)
        if (useSkeleton && skeleton) {
          return <ChartSkeleton type={skeleton} height={height} />;
        }
        return <FrostOverlay height={height} showSpinner showProgress staggerIndex={staggerIndex} />;

      case 'error':
        return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;

      case 'refreshing':
        // Safety check: If somehow refreshing with no data, show frost overlay
        if (empty) {
          if (useSkeleton && skeleton) {
            return <ChartSkeleton type={skeleton} height={height} />;
          }
          return <FrostOverlay height={height} showSpinner showProgress staggerIndex={staggerIndex} />;
        }
        // Has prior data, fetching update - show light frost overlay with content visible
        return (
          <FrostOverlay
            visible
            height={height}
            showSpinner={false}
            showProgress
            isRefreshing
            staggerIndex={staggerIndex}
          >
            {children}
          </FrostOverlay>
        );

      case 'success':
        // ONLY show empty state when status === 'success' AND data is empty
        if (empty) {
          // If actively filtering, show light frost overlay on empty state
          if (isFiltering) {
            return (
              <FrostOverlay
                visible
                height={height}
                showSpinner={false}
                showProgress
                isRefreshing
                staggerIndex={staggerIndex}
              >
                <div
                  className="flex items-center justify-center text-sm text-brand-blue"
                  style={{ minHeight: height }}
                >
                  No data for selected filters.
                </div>
              </FrostOverlay>
            );
          }
          return (
            <div
              className="flex items-center justify-center text-sm text-brand-blue"
              style={{ minHeight: height }}
            >
              No data for selected filters.
            </div>
          );
        }
        // Success with data - render chart (check isFiltering for light frost overlay)
        if (isFiltering) {
          return (
            <FrostOverlay
              visible
              height={height}
              showSpinner={false}
              showProgress
              isRefreshing
              staggerIndex={staggerIndex}
            >
              {children}
            </FrostOverlay>
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
    if (useSkeleton && skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <FrostOverlay height={height} showSpinner showProgress staggerIndex={staggerIndex} />;
  }

  // Initial load
  if (loading && !isUpdating) {
    if (useSkeleton && skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <FrostOverlay height={height} showSpinner showProgress staggerIndex={staggerIndex} />;
  }

  // Error state
  if (error) {
    return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;
  }

  // Empty state (legacy - less safe, kept for backward compat)
  if (empty && !loading && !isUpdating && !isPendingProp) {
    return (
      <div
        className="flex items-center justify-center text-sm text-brand-blue"
        style={{ minHeight: height }}
      >
        No data for selected filters.
      </div>
    );
  }

  // Success state with optional updating overlay (frost style)
  if (isUpdating) {
    return (
      <FrostOverlay
        visible
        height={height}
        showSpinner={false}
        showProgress
        isRefreshing
        staggerIndex={staggerIndex}
      >
        {children}
      </FrostOverlay>
    );
  }

  return (
    <div className="relative" style={{ minHeight: height }}>
      {children}
    </div>
  );
});

export default ChartFrame;
