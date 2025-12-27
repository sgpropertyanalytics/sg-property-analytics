import React from 'react';

/**
 * KPICardV2 - Universal Card System
 *
 * Two-layer architecture (title + hero):
 * ┌─────────────────────────────────────────┐
 * │ LABEL  (?)                     ← top    │
 * │                                         │
 * │ $1,858 psf                              │
 * │ ▲ +3.2% QoQ                    ← hero   │
 * │ Prev: $1,763 psf                        │
 * └─────────────────────────────────────────┘
 *
 * Footnote moved to tooltip hover.
 */

interface KPICardV2Props {
  title: string;
  /** Subtitle shown below title (methodology context) */
  subtitle?: string;
  /** Tooltip text shown on hover of info icon */
  tooltip?: string;
  /** Primary value - can be string or structured ReactNode */
  value: string | React.ReactNode;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Footnote text - now appended to tooltip instead of footer */
  footnote?: string;
  /** @deprecated Use footnote instead */
  transition?: string;
  loading?: boolean;
  className?: string;
}

export function KPICardV2({
  title,
  subtitle,
  tooltip,
  value,
  trend,
  footnote,
  transition,
  loading = false,
  className = '',
}: KPICardV2Props) {
  // Combine tooltip and footnote for hover display
  const footerText = footnote || transition;
  const combinedTooltip = [tooltip, footerText].filter(Boolean).join('\n\n');

  return (
    <div
      className={`
        bg-white border border-[#94B4C1]/50 rounded-lg p-4 sm:p-5
        h-36 flex flex-col overflow-hidden
        shadow-sm hover:shadow-md transition-shadow duration-200
        ${className}
      `.trim()}
    >
      {/* Layer 1: Header - pinned to top */}
      <div className="flex-shrink-0 mb-2">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/30 rounded w-2/3 animate-pulse" />
        ) : (
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#547792]">
                {title}
              </span>
              {combinedTooltip && (
                <div className="relative group">
                  <span className="w-3.5 h-3.5 flex items-center justify-center text-[9px] text-[#94B4C1] hover:text-[#547792] cursor-help transition-colors border border-[#94B4C1] rounded-full">
                    ?
                  </span>
                  <div className="absolute left-0 top-5 z-[100] hidden group-hover:block w-64 max-w-[calc(100vw-2rem)] p-3 bg-[#213448] text-white text-xs leading-relaxed rounded shadow-lg whitespace-pre-line pointer-events-none">
                    {combinedTooltip}
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

      {/* Layer 2: Hero Data - fills remaining space, aligned to bottom */}
      <div className="flex-1 flex items-end pb-1">
        {loading ? (
          <div className="h-8 bg-[#94B4C1]/30 rounded w-24 animate-pulse" />
        ) : typeof value === 'string' ? (
          <span className="text-[22px] sm:text-[32px] font-bold text-[#213448] font-mono tabular-nums leading-none">
            {value}
          </span>
        ) : (
          <div className="space-y-1">{value}</div>
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
  return {
    title: kpi.title,
    value: kpi.formatted_value,
    trend: kpi.trend,
    footnote: kpi.insight,
  };
}

export default KPICardV2;
