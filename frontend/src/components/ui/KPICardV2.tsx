import React from 'react';

/**
 * KPICardV2 - Universal Card System
 *
 * Strict anatomy with fixed layer heights:
 * ┌─────────────────────────────────────────┐
 * │ Layer 1: Header (h-6 = 24px)            │
 * │ LABEL                            [icon] │
 * ├─────────────────────────────────────────┤
 * │ Layer 2: Hero Data (h-12 = 48px)        │
 * │ $1,858  ▼7.1%                           │
 * ├─────────────────────────────────────────┤
 * │ Layer 3: Visual Slot (h-8 = 32px)       │
 * │ ~~~~~~~~●  or  ══════  or  [■■■□□]      │
 * └─────────────────────────────────────────┘
 *
 * Visual Slot Types:
 * - trend: Sparkline (2px stroke, no fill, end dot)
 * - comparison: Bullet chart (two lines + tick)
 * - composition: Stacked bar (region segments)
 */

interface KPICardV2Props {
  title: string;
  value: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  /** Visual slot type */
  variant?: 'trend' | 'comparison' | 'composition';
  /** Comparison data for bullet chart */
  comparison?: {
    primary: { label: string; value: number };
    secondary: { label: string; value: number };
  };
  /** Composition data for stacked bar */
  composition?: {
    segments: Array<{ label: string; value: number; color: string }>;
    total: number;
  };
  /** Context text */
  transition?: string;
  footerMeta?: string;
  loading?: boolean;
  className?: string;
}

export function KPICardV2({
  title,
  value,
  trend,
  variant = 'trend',
  comparison,
  composition,
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

  // Visual Slot: Trend (Sparkline)
  const renderTrendSlot = () => {
    const points = trend?.direction === 'up'
      ? [[0, 28], [20, 26], [40, 24], [60, 20], [80, 22], [100, 16], [120, 18], [140, 12], [160, 14], [180, 8], [200, 10], [220, 4]]
      : trend?.direction === 'down'
      ? [[0, 4], [20, 8], [40, 6], [60, 12], [80, 10], [100, 16], [120, 14], [140, 20], [160, 18], [180, 24], [200, 22], [220, 28]]
      : [[0, 16], [20, 14], [40, 18], [60, 16], [80, 15], [100, 17], [120, 16], [140, 14], [160, 16], [180, 15], [200, 17], [220, 16]];

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    const lastPoint = points[points.length - 1];

    return (
      <svg className="w-full h-full" viewBox="0 0 220 32" preserveAspectRatio="none">
        <path
          d={pathD}
          fill="none"
          stroke="#547792"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="4"
          fill="#547792"
        />
      </svg>
    );
  };

  // Visual Slot: Comparison (Bullet Chart)
  const renderComparisonSlot = () => {
    if (!comparison) return null;
    const maxVal = Math.max(comparison.primary.value, comparison.secondary.value);
    const primaryPct = (comparison.primary.value / maxVal) * 100;
    const secondaryPct = (comparison.secondary.value / maxVal) * 100;

    return (
      <div className="w-full h-full flex flex-col justify-center gap-1.5">
        {/* Primary line (Navy) */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#547792] w-8 shrink-0">{comparison.primary.label}</span>
          <div className="flex-1 h-0.5 bg-[#94B4C1]/30 relative">
            <div
              className="absolute top-0 left-0 h-0.5 bg-[#213448]"
              style={{ width: `${primaryPct}%` }}
            />
          </div>
        </div>
        {/* Secondary line (Grey) */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#94B4C1] w-8 shrink-0">{comparison.secondary.label}</span>
          <div className="flex-1 h-0.5 bg-[#94B4C1]/30 relative">
            <div
              className="absolute top-0 left-0 h-0.5 bg-[#94B4C1]"
              style={{ width: `${secondaryPct}%` }}
            />
          </div>
        </div>
        {/* Vertical tick showing difference */}
        <div className="flex-1 relative">
          <div
            className="absolute top-0 w-px h-full bg-[#213448]"
            style={{ left: `${Math.min(primaryPct, secondaryPct) + 32}%` }}
          />
        </div>
      </div>
    );
  };

  // Visual Slot: Composition (Stacked Bar)
  const renderCompositionSlot = () => {
    if (!composition) return null;
    const { segments, total } = composition;

    return (
      <div className="w-full h-full flex items-center">
        <div className="w-full h-2 flex rounded-sm overflow-hidden bg-[#94B4C1]/20">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="h-full transition-all duration-500"
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${seg.value.toLocaleString()}`}
            />
          ))}
        </div>
      </div>
    );
  };

  // Render the appropriate visual slot
  const renderVisualSlot = () => {
    if (loading) {
      return <div className="w-full h-full bg-[#94B4C1]/10 rounded animate-pulse" />;
    }
    switch (variant) {
      case 'comparison':
        return renderComparisonSlot();
      case 'composition':
        return renderCompositionSlot();
      case 'trend':
      default:
        return renderTrendSlot();
    }
  };

  const hasContext = transition || footerMeta || trend?.label;

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
        {/* Optional context as subtle text */}
        {!loading && hasContext && (
          <span className="text-[9px] text-[#94B4C1] leading-none">
            {transition || trend?.label || footerMeta}
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

      {/* Layer 3: Visual Slot (h-8 = 32px) */}
      <div className="h-8 w-full flex items-end">
        {renderVisualSlot()}
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
