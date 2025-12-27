import React from 'react';

/**
 * KPICardV2 - Standardized KPI card matching Market Pulse design
 *
 * Structure:
 * ┌─────────────────────────────────┐
 * │ [Header - dark blue #213448]    │
 * │ Title (e.g., "Market Median PSF")│
 * ├─────────────────────────────────┤
 * │ [Body - white]                  │
 * │ Value  Trend%                   │
 * ├─────────────────────────────────┤
 * │ [Footer - sand #EAE0CF/30]      │
 * │ $2,001 → $1,858 • 169 txns      │
 * └─────────────────────────────────┘
 *
 * Designed to consume KPI v2 API response directly.
 */

interface KPICardV2Props {
  /** KPI title displayed in header (e.g., "Market Median PSF") */
  title: string;
  /** Main value (pre-formatted, e.g., "$1,858" or "36.5%") */
  value: string;
  /** Trend percentage and direction */
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Transition text for footer (e.g., "$2,001 → $1,858") */
  transition?: string;
  /** Additional footer text (e.g., "169 txns") */
  footerMeta?: string;
  /** Loading state */
  loading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function KPICardV2({
  title,
  value,
  trend,
  transition,
  footerMeta,
  loading = false,
  className = '',
}: KPICardV2Props) {
  // Determine trend color based on direction
  const getTrendColor = (direction: 'up' | 'down' | 'neutral') => {
    switch (direction) {
      case 'up':
        return 'text-red-500'; // Up = price increase = bad for buyers
      case 'down':
        return 'text-green-600'; // Down = price decrease = good for buyers
      default:
        return 'text-[#547792]';
    }
  };

  const hasFooter = transition || footerMeta;

  return (
    <div
      className={`
        bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden
        ${className}
      `.trim()}
    >
      {/* Header - Dark blue with title */}
      <div className="bg-[#213448] px-3 py-2 text-white min-h-[32px] flex items-center">
        {loading ? (
          <div className="h-3 bg-white/20 rounded w-3/4 animate-pulse" />
        ) : (
          <span className="text-xs md:text-sm font-medium leading-tight">
            {title}
          </span>
        )}
      </div>

      {/* Body - Value and trend */}
      <div className="p-3 md:p-4">
        {loading ? (
          <div className="h-8 bg-[#94B4C1]/30 rounded animate-pulse w-2/3" />
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold text-[#213448] font-mono tabular-nums">
              {value}
            </span>
            {trend && (
              <span className={`text-xs font-medium ${getTrendColor(trend.direction)}`}>
                {trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%
              </span>
            )}
            {trend?.label && !trend.value && (
              <span className="text-xs text-[#547792]">{trend.label}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer - Transition and meta - matches chart footer style */}
      {hasFooter && (
        <div className="px-3 py-2 md:px-4 bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30">
          <div className="text-[10px] md:text-xs text-[#547792] flex items-center gap-1.5">
            {loading ? (
              <div className="h-3 bg-[#94B4C1]/20 rounded w-1/2 animate-pulse" />
            ) : (
              <>
                {transition && <span>{transition}</span>}
                {transition && footerMeta && <span>•</span>}
                {footerMeta && <span>{footerMeta}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * KPICardV2Skeleton - Loading placeholder
 */
export function KPICardV2Skeleton({ className = '' }: { className?: string }) {
  return (
    <KPICardV2
      title="Loading..."
      value=""
      loading={true}
      className={className}
    />
  );
}

/**
 * KPICardV2Group - Grid wrapper for KPI cards
 */
export function KPICardV2Group({
  children,
  columns = 4,
  className = '',
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  };

  return (
    <div className={`grid gap-3 md:gap-4 ${gridCols[columns]} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Helper to map v2 API response to KPICardV2 props
 */
export function mapKpiV2ToCardProps(kpi: {
  kpi_id: string;
  title: string;
  value: number | null;
  formatted_value: string;
  trend?: { value: number; direction: 'up' | 'down' | 'neutral'; label?: string };
  insight?: string;  // Used as transition text (e.g., "$2,001 → $1,858")
  meta?: Record<string, unknown>;
}): KPICardV2Props {
  // Build footer meta from common meta fields
  let footerMeta = '';
  if (kpi.meta) {
    if ('current_count' in kpi.meta) {
      footerMeta = `${(kpi.meta.current_count as number).toLocaleString()} txns`;
    }
  }

  return {
    title: kpi.title,
    value: kpi.formatted_value,
    trend: kpi.trend,
    transition: kpi.insight,  // insight contains the "$X → $Y" transition
    footerMeta: footerMeta || undefined,
  };
}

export default KPICardV2;
