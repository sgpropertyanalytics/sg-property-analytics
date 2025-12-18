import React, { ReactNode } from 'react';

/**
 * ChartCard - Responsive wrapper for all charts
 *
 * Following chart-container-contract skill:
 * - All responsive behavior happens OUTSIDE the chart
 * - Chart internals should never be modified for responsiveness
 * - Uses ResponsiveContainer pattern for chart libraries
 *
 * Breakpoint behavior:
 * - Desktop (1440px+): Full padding, large titles
 * - Tablet (768-1023px): Medium padding
 * - Mobile (< 768px): Compact padding, smaller titles
 */

interface ChartCardProps {
  /** Chart title displayed in header */
  title: string;
  /** Optional subtitle for additional context */
  subtitle?: string;
  /** The chart component - DO NOT modify for responsiveness */
  children: ReactNode;
  /** Additional CSS classes for the card container */
  className?: string;
  /** Minimum height in pixels (default: 300) */
  minHeight?: number;
  /** Optional aspect ratio (e.g., "16/9", "4/3", "1/1") */
  aspectRatio?: string;
  /** Optional header actions (buttons, dropdowns, etc.) */
  actions?: ReactNode;
  /** Loading state - shows skeleton */
  isLoading?: boolean;
  /** Error message - shows error state */
  error?: string | null;
  /** Optional updating indicator (subtle, doesn't hide content) */
  isUpdating?: boolean;
  /** Optional info text shown below subtitle */
  info?: string;
  /** Span full width in grid layouts */
  fullWidth?: boolean;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  minHeight = 300,
  aspectRatio,
  actions,
  isLoading,
  error,
  isUpdating,
  info,
  fullWidth,
}: ChartCardProps) {
  return (
    <div
      className={`
        bg-white rounded-lg border border-[#94B4C1]/50 shadow-sm
        flex flex-col overflow-hidden
        transition-opacity duration-150
        ${isUpdating ? 'opacity-70' : ''}
        ${fullWidth ? 'lg:col-span-2' : ''}
        ${className}
      `.trim()}
    >
      {/* Card Header - SAFE to style responsively */}
      <div className="
        flex items-start justify-between gap-2
        px-3 py-2.5
        md:px-4 md:py-3
        lg:px-5 lg:py-3
        border-b border-[#94B4C1]/30
      ">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[#213448] text-sm md:text-base truncate">
              {title}
            </h3>
            {isUpdating && (
              <div className="w-3 h-3 border-2 border-[#547792] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>
          {subtitle && (
            <p className="text-xs md:text-sm text-[#547792] mt-0.5 truncate">
              {subtitle}
            </p>
          )}
          {info && (
            <p className="text-[10px] md:text-xs text-[#94B4C1] mt-1">
              {info}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Chart Container - THE BOUNDARY */}
      <div
        className="
          flex-1
          p-2 md:p-3 lg:p-4
          overflow-hidden
        "
        style={{
          minHeight: `${minHeight}px`,
          ...(aspectRatio && { aspectRatio }),
        }}
      >
        {isLoading ? (
          <ChartLoadingState />
        ) : error ? (
          <ChartErrorState message={error} />
        ) : (
          /* CHART GOES HERE - DO NOT MODIFY WHAT'S INSIDE */
          children
        )}
      </div>
    </div>
  );
}

function ChartLoadingState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#547792]">Loading chart...</span>
      </div>
    </div>
  );
}

function ChartErrorState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center px-4">
        <svg
          className="w-10 h-10 text-red-400 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-sm text-[#547792]">{message}</p>
      </div>
    </div>
  );
}

/**
 * ChartCardSkeleton - Placeholder while data is loading
 */
export function ChartCardSkeleton({
  minHeight = 300,
  className = ''
}: {
  minHeight?: number;
  className?: string;
}) {
  return (
    <div
      className={`
        bg-white rounded-lg border border-[#94B4C1]/50 shadow-sm
        animate-pulse
        ${className}
      `}
    >
      <div className="px-4 py-3 border-b border-[#94B4C1]/30">
        <div className="h-5 bg-[#94B4C1]/30 rounded w-1/3 mb-2" />
        <div className="h-3 bg-[#94B4C1]/20 rounded w-1/4" />
      </div>
      <div
        className="p-4 flex items-center justify-center"
        style={{ minHeight: `${minHeight}px` }}
      >
        <div className="w-full h-full bg-[#94B4C1]/10 rounded" />
      </div>
    </div>
  );
}

export default ChartCard;
