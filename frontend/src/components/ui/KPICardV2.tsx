import React from 'react';

/**
 * KPICardV2 - Universal Card System
 *
 * Space-Between Architecture (no fixed layer heights):
 * ┌─────────────────────────────────────────┐
 * │ LABEL                          ← top    │
 * │                                         │
 * │ $1,858  ▼7.1%                  ← center │
 * │                                         │
 * │ $2,001 (30 days ago)           ← bottom │
 * └─────────────────────────────────────────┘
 *
 * justify-between forces perfect vertical distribution.
 */

interface KPICardV2Props {
  title: string;
  /** Subtitle shown below title (methodology context) */
  subtitle?: string;
  /** Tooltip text shown on hover of info icon */
  tooltip?: string;
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
  subtitle,
  tooltip,
  value,
  trend,
  transition,
  footerMeta,
  loading = false,
  className = '',
}: KPICardV2Props) {
  return (
    <div
      className={`
        bg-white border border-[#94B4C1]/50 rounded-lg pt-3 px-4 pb-4 sm:pt-3.5 sm:px-5 sm:pb-5
        h-36 flex flex-col justify-between
        shadow-sm hover:shadow-md transition-shadow duration-200
        ${className}
      `.trim()}
    >
      {/* Layer 1: Header - pinned to top */}
      <div className="flex-shrink-0">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/30 rounded w-2/3 animate-pulse" />
        ) : (
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#547792]">
                {title}
              </span>
              {tooltip && (
                <div className="relative group">
                  <span className="w-3.5 h-3.5 flex items-center justify-center text-[9px] text-[#94B4C1] hover:text-[#547792] cursor-help transition-colors border border-[#94B4C1] rounded-full">
                    ?
                  </span>
                  <div className="absolute left-0 top-5 z-50 hidden group-hover:block w-48 p-2 bg-[#213448] text-white text-[10px] leading-relaxed rounded shadow-lg">
                    {tooltip}
                  </div>
                </div>
              )}
            </div>
            {subtitle && (
              <p className="text-[9px] text-[#94B4C1] mt-0.5 leading-tight">
                {subtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Layer 2: Hero Data - centered by justify-between */}
      <div>
        {loading ? (
          <div className="h-8 bg-[#94B4C1]/30 rounded w-24 animate-pulse" />
        ) : (
          <span className="text-[22px] sm:text-[32px] font-bold text-[#213448] font-mono tabular-nums leading-none">
            {value}
          </span>
        )}
      </div>

      {/* Layer 3: Context - pinned to bottom */}
      <div className="flex-shrink-0">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/20 rounded w-1/2 animate-pulse" />
        ) : (
          <span className="text-xs text-[#547792]">
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
