import React from 'react';

/**
 * KPICardV2 - Pro-Tier KPI Card Design (Refined)
 *
 * Features:
 * - Full-width sparkline anchored at bottom with gradient fill
 * - Micro-bar visualization for comparison metrics
 * - Radial gauge for index/score metrics
 * - Tabular figures with strict baseline alignment
 *
 * Variants:
 * - default: Standard KPI with sparkline
 * - comparison: Two micro-bars (e.g., New vs Resale)
 * - gauge: Radial arc for scores (e.g., Market Momentum)
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
  /** Card variant for special visualizations */
  variant?: 'default' | 'comparison' | 'gauge';
  /** Comparison data for micro-bars (variant="comparison") */
  comparison?: {
    primary: { label: string; value: number };
    secondary: { label: string; value: number };
  };
  /** Gauge value 0-100 (variant="gauge") */
  gaugeValue?: number;
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
  variant = 'default',
  comparison,
  gaugeValue,
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ),
        };
      case 'down':
        return {
          text: 'text-green-600',
          bg: 'bg-green-50',
          icon: (
            <svg className="w-3 h-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

  // Render micro-bar comparison (for New Launch Premium)
  const renderComparison = () => {
    if (!comparison) return null;
    const maxVal = Math.max(comparison.primary.value, comparison.secondary.value);
    const primaryWidth = (comparison.primary.value / maxVal) * 100;
    const secondaryWidth = (comparison.secondary.value / maxVal) * 100;

    return (
      <div className="mt-2 sm:mt-3 space-y-1">
        {/* Primary bar (New Launch) */}
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="text-[9px] sm:text-[10px] text-[#547792] w-8 sm:w-12 shrink-0">{comparison.primary.label}</span>
          <div className="flex-1 h-2.5 sm:h-3 bg-[#94B4C1]/20 rounded-sm overflow-hidden">
            <div
              className="h-full bg-[#213448] rounded-sm transition-all duration-500"
              style={{ width: `${primaryWidth}%` }}
            />
          </div>
          <span className="text-[9px] sm:text-[10px] font-mono text-[#213448] w-12 sm:w-14 text-right">
            ${comparison.primary.value.toLocaleString()}
          </span>
        </div>
        {/* Secondary bar (Resale) */}
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="text-[9px] sm:text-[10px] text-[#94B4C1] w-8 sm:w-12 shrink-0">{comparison.secondary.label}</span>
          <div className="flex-1 h-2.5 sm:h-3 bg-[#94B4C1]/20 rounded-sm overflow-hidden">
            <div
              className="h-full bg-[#94B4C1] rounded-sm transition-all duration-500"
              style={{ width: `${secondaryWidth}%` }}
            />
          </div>
          <span className="text-[9px] sm:text-[10px] font-mono text-[#547792] w-12 sm:w-14 text-right">
            ${comparison.secondary.value.toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  // Render radial gauge (for Market Momentum)
  const renderGauge = () => {
    const score = gaugeValue ?? 50;
    const normalizedScore = Math.max(0, Math.min(100, score));
    // Arc goes from -135deg to +135deg (270deg total)
    const arcAngle = (normalizedScore / 100) * 270 - 135;

    // Determine zone color
    let zoneColor = '#94B4C1'; // Neutral (gray)
    let zoneLabel = 'Neutral';
    if (normalizedScore >= 60) {
      zoneColor = '#ef4444'; // Hot (red) - seller's market
      zoneLabel = "Seller's";
    } else if (normalizedScore <= 40) {
      zoneColor = '#22c55e'; // Cool (green) - buyer's market
      zoneLabel = "Buyer's";
    }

    return (
      <div className="flex items-center justify-end">
        <svg width="40" height="28" viewBox="0 0 48 32" className="sm:w-12 sm:h-8 overflow-visible">
          {/* Background arc */}
          <path
            d="M 6 28 A 20 20 0 0 1 42 28"
            fill="none"
            stroke="#94B4C1"
            strokeWidth="4"
            strokeOpacity="0.2"
            strokeLinecap="round"
          />
          {/* Colored segments */}
          <path
            d="M 6 28 A 20 20 0 0 1 14 12"
            fill="none"
            stroke="#22c55e"
            strokeWidth="4"
            strokeOpacity="0.3"
            strokeLinecap="round"
          />
          <path
            d="M 34 12 A 20 20 0 0 1 42 28"
            fill="none"
            stroke="#ef4444"
            strokeWidth="4"
            strokeOpacity="0.3"
            strokeLinecap="round"
          />
          {/* Needle */}
          <line
            x1="24"
            y1="28"
            x2="24"
            y2="10"
            stroke={zoneColor}
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${arcAngle}, 24, 28)`}
          />
          {/* Center dot */}
          <circle cx="24" cy="28" r="3" fill={zoneColor} />
        </svg>
        <span className="text-[9px] text-[#94B4C1] ml-1">{zoneLabel}</span>
      </div>
    );
  };

  // Full-width sparkline at bottom
  const renderSparkline = () => {
    if (!trend || variant !== 'default') return null;

    const pathUp = "M0,40 C20,38 40,42 60,30 S100,35 120,20 S160,25 180,10 S220,15 240,5";
    const pathDown = "M0,5 C20,10 40,8 60,20 S100,15 120,30 S160,25 180,35 S220,32 240,40";
    const pathNeutral = "M0,22 C20,20 40,24 60,22 S100,23 120,21 S160,22 180,23 S220,21 240,22";

    const path = trend.direction === 'up' ? pathUp : trend.direction === 'down' ? pathDown : pathNeutral;
    const fillPath = path + " L240,45 L0,45 Z";

    return (
      <div className="absolute bottom-0 left-0 right-0 h-10 md:h-12 overflow-hidden rounded-b-lg pointer-events-none">
        <svg
          className="w-full h-full"
          viewBox="0 0 240 45"
          preserveAspectRatio="none"
        >
          {/* Gradient fill */}
          <defs>
            <linearGradient id={`sparkGradient-${trend.direction}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#547792" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#547792" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={fillPath}
            fill={`url(#sparkGradient-${trend.direction})`}
          />
          <path
            d={path}
            fill="none"
            stroke="#547792"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  };

  return (
    <div
      className={`
        relative bg-white rounded-lg border border-[#94B4C1]/50 p-4 md:p-5
        shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden
        ${variant === 'default' ? 'pb-12 md:pb-14' : ''}
        ${className}
      `.trim()}
    >
      {/* Label - Top */}
      <div className="flex justify-between items-start mb-2">
        {loading ? (
          <div className="h-3 bg-[#94B4C1]/30 rounded w-2/3 animate-pulse" />
        ) : (
          <h3 className="text-[#547792] text-[11px] font-bold uppercase tracking-wider leading-none">
            {title}
          </h3>
        )}
      </div>

      {/* Value - Center (with strict alignment) */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          {loading ? (
            <div className="h-9 bg-[#94B4C1]/30 rounded w-24 animate-pulse" />
          ) : (
            <span className="text-[#213448] text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums leading-none">
              {value}
            </span>
          )}
        </div>

        {/* Gauge for Market Momentum */}
        {variant === 'gauge' && !loading && renderGauge()}
      </div>

      {/* Trend Badge + Context (for default variant) */}
      {variant === 'default' && (
        <div className="flex items-center gap-2 mt-2">
          {loading ? (
            <div className="h-5 bg-[#94B4C1]/20 rounded w-16 animate-pulse" />
          ) : trend && trend.value !== 0 ? (
            <>
              <span
                className={`
                  inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded
                  ${getTrendStyles(trend.direction).text}
                  ${getTrendStyles(trend.direction).bg}
                `}
              >
                {getTrendStyles(trend.direction).icon}
                {trend.value > 0 ? '+' : ''}{Math.abs(trend.value).toFixed(1)}%
              </span>
              {hasContext && (
                <span className="text-[#94B4C1] text-[10px]">
                  {transition || trend.label || footerMeta}
                </span>
              )}
            </>
          ) : hasContext ? (
            <span className="text-[#94B4C1] text-[10px]">
              {transition || (trend?.label) || footerMeta}
            </span>
          ) : null}
        </div>
      )}

      {/* Micro-bar comparison (for New Launch Premium) */}
      {variant === 'comparison' && !loading && renderComparison()}

      {/* Gauge context text */}
      {variant === 'gauge' && !loading && hasContext && (
        <div className="mt-2">
          <span className="text-[#94B4C1] text-[10px]">
            {transition || trend?.label || footerMeta}
          </span>
        </div>
      )}

      {/* Full-width Sparkline at bottom */}
      {renderSparkline()}
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
