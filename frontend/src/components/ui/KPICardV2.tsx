import React from 'react';

/**
 * KPICardV2 - Pro-Tier KPI Card Design
 *
 * Structure:
 * ┌─────────────────────────────────────────┐
 * │ MARKET MEDIAN PSF              (i)      │  ← Label (uppercase, #547792)
 * │                                         │
 * │ $1,858                                  │  ← Value (bold 3xl, #213448)
 * │                                         │
 * │ ▲ 7.1%              ~~~sparkline~~~     │  ← Trend badge + context
 * │ vs last month                           │
 * └─────────────────────────────────────────┘
 *
 * Design principles:
 * - White background for readability (dark text on light)
 * - Subtle border (#94B4C1/50) guides eye without trapping it
 * - Typography hierarchy: Label → Value → Context
 * - Standard red/green for trends (UX convention)
 */

interface KPICardV2Props {
  /** KPI title displayed at top (e.g., "Market Median PSF") */
  title: string;
  /** Main value (pre-formatted, e.g., "$1,858" or "36.5%") */
  value: string;
  /** Trend percentage and direction */
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Context text below trend (e.g., "$2,001 (30 days ago)") */
  transition?: string;
  /** Additional context (e.g., "169 txns") */
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
  // Trend styling based on direction
  const getTrendStyles = (direction: 'up' | 'down' | 'neutral') => {
    switch (direction) {
      case 'up':
        return {
          text: 'text-red-500',
          bg: 'bg-red-50',
          icon: (
            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          ),
        };
      case 'down':
        return {
          text: 'text-green-600',
          bg: 'bg-green-50',
          icon: (
            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          ),
        };
      default:
        return {
          text: 'text-[#547792]',
          bg: 'bg-[#94B4C1]/10',
          icon: (
            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
          ),
        };
    }
  };

  const hasContext = transition || footerMeta || trend?.label;

  return (
    <div
      className={`
        relative bg-white rounded-lg border border-[#94B4C1]/50 p-4 md:p-5
        shadow-sm hover:shadow-md transition-all duration-200
        ${className}
      `.trim()}
    >
      {/* Label - Top */}
      <div className="flex justify-between items-start mb-1">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/30 rounded w-2/3 animate-pulse" />
        ) : (
          <h3 className="text-[#547792] text-[11px] font-bold uppercase tracking-wider">
            {title}
          </h3>
        )}
      </div>

      {/* Value - Center */}
      <div className="flex items-baseline gap-3 mt-1">
        {loading ? (
          <div className="h-9 bg-[#94B4C1]/30 rounded w-1/2 animate-pulse" />
        ) : (
          <span className="text-[#213448] text-2xl md:text-3xl font-bold tracking-tight font-mono tabular-nums">
            {value}
          </span>
        )}
      </div>

      {/* Trend + Context - Bottom */}
      <div className="flex justify-between items-end mt-3 min-h-[32px]">
        <div className="flex flex-col gap-0.5">
          {loading ? (
            <div className="h-5 bg-[#94B4C1]/20 rounded w-16 animate-pulse" />
          ) : trend ? (
            <>
              {/* Trend Badge */}
              <span
                className={`
                  flex items-center text-xs font-bold px-1.5 py-0.5 rounded w-fit
                  ${getTrendStyles(trend.direction).text}
                  ${getTrendStyles(trend.direction).bg}
                `}
              >
                {getTrendStyles(trend.direction).icon}
                {trend.value > 0 ? '+' : ''}{Math.abs(trend.value).toFixed(1)}%
              </span>
              {/* Context text */}
              {hasContext && (
                <span className="text-[#94B4C1] text-[10px] mt-0.5">
                  {transition || trend.label || footerMeta}
                </span>
              )}
            </>
          ) : hasContext ? (
            <span className="text-[#94B4C1] text-[10px]">
              {transition || footerMeta}
            </span>
          ) : null}
        </div>

        {/* Mini Sparkline (decorative) */}
        {!loading && trend && (
          <svg className="w-16 h-6 overflow-visible opacity-60" preserveAspectRatio="none">
            <path
              d={trend.direction === 'up'
                ? "M0 20 L8 18 L16 22 L24 12 L32 16 L40 8 L48 14 L56 4"
                : trend.direction === 'down'
                ? "M0 4 L8 8 L16 6 L24 14 L32 10 L40 18 L48 12 L56 20"
                : "M0 12 L8 14 L16 10 L24 12 L32 11 L40 13 L48 12 L56 12"}
              fill="none"
              stroke="#547792"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={trend.direction === 'up'
                ? "M0 20 L8 18 L16 22 L24 12 L32 16 L40 8 L48 14 L56 4 V 24 H 0 Z"
                : trend.direction === 'down'
                ? "M0 4 L8 8 L16 6 L24 14 L32 10 L40 18 L48 12 L56 20 V 24 H 0 Z"
                : "M0 12 L8 14 L16 10 L24 12 L32 11 L40 13 L48 12 L56 12 V 24 H 0 Z"}
              fill="#EAE0CF"
              fillOpacity="0.4"
              stroke="none"
            />
          </svg>
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
    transition: kpi.insight,
    footerMeta: footerMeta || undefined,
  };
}

export default KPICardV2;
