import React from 'react';

/**
 * KPICardV2 - Universal Card System
 *
 * Strict anatomy with fixed layer heights:
 * ┌─────────────────────────────────────────┐
 * │ Layer 1: Header (h-6 = 24px)            │
 * │ LABEL                                   │
 * ├─────────────────────────────────────────┤
 * │ Layer 2: Hero Data (h-12 = 48px)        │
 * │ $1,858  ▼7.1%                           │
 * ├─────────────────────────────────────────┤
 * │ Layer 3: Context (h-8 = 32px)           │
 * │ $2,001 (30 days ago)                    │
 * └─────────────────────────────────────────┘
 */

interface KPICardV2Props {
  title: string;
  value: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Context text shown in Layer 3 */
  transition?: string;
  footerMeta?: string;
  loading?: boolean;
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
  // Trend badge colors
  const getTrendStyles = (direction: 'up' | 'down' | 'neutral') => {
    switch (direction) {
      case 'up':
        return { text: 'text-red-500', bg: 'bg-red-50', arrow: '▲' };
      case 'down':
        return { text: 'text-green-600', bg: 'bg-green-50', arrow: '▼' };
      default:
        return { text: 'text-[#547792]', bg: 'bg-[#94B4C1]/10', arrow: '―' };
    }
  };

  return (
    <div
      className={`
        bg-white border border-[#94B4C1]/50 rounded-lg p-4 sm:p-5
        h-36 flex flex-col justify-between
        shadow-sm hover:shadow-md transition-shadow duration-200
        ${className}
      `.trim()}
    >
      {/* Layer 1: Header (h-6 = 24px) */}
      <div className="h-6 flex justify-between items-start">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/30 rounded w-2/3 animate-pulse" />
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#547792] leading-none">
            {title}
          </span>
        )}
      </div>

      {/* Layer 2: Hero Data (h-12 = 48px) */}
      <div className="h-12 flex items-baseline gap-2">
        {loading ? (
          <div className="h-8 bg-[#94B4C1]/30 rounded w-24 animate-pulse" />
        ) : (
          <>
            <span className="text-2xl sm:text-[32px] font-bold text-[#213448] font-mono tabular-nums leading-none">
              {value}
            </span>
            {trend && trend.value !== 0 && (
              <span
                className={`
                  text-xs font-medium px-1 rounded leading-none
                  ${getTrendStyles(trend.direction).text}
                  ${getTrendStyles(trend.direction).bg}
                `}
              >
                {getTrendStyles(trend.direction).arrow}
                {Math.abs(trend.value).toFixed(1)}%
              </span>
            )}
          </>
        )}
      </div>

      {/* Layer 3: Context (h-8 = 32px) */}
      <div className="h-8 w-full flex items-end">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/20 rounded w-1/2 animate-pulse" />
        ) : (
          <span className="text-[10px] text-[#94B4C1] leading-none">
            {transition || trend?.label || footerMeta}
          </span>
        )}
      </div>
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
  insight?: string;
  meta?: Record<string, unknown>;
}): KPICardV2Props {
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
    transition: kpi.insight,
    footerMeta: footerMeta || undefined,
  };
}

export default KPICardV2;
