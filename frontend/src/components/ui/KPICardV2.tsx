import React from 'react';
import { HelpTooltip } from './HelpTooltip';
import { FrostOverlay } from '../common/loading';

/**
 * KPICardV2 - Universal Card System
 *
 * Supports two variants:
 * - "card" (default): Standalone card with luxury-card styling
 * - "cell": Minimal cell for use inside KPIHudStrip (no card styling)
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
  /** Inline badge shown after value (e.g., "Seller advantage" → displays first word only) */
  badge?: {
    text: string;
    color: 'green' | 'red' | 'gray';
  };
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
  /** Variant: "card" (standalone with styling) or "cell" (minimal for HUD strip) */
  variant?: 'card' | 'cell';
}

// Badge color mapping
const BADGE_COLORS = {
  green: 'text-status-live',
  red: 'text-status-negative',
  gray: 'text-mono-light',
} as const;

/**
 * KPIHeroContent - Shared content pattern for KPI cards
 *
 * Handles value + badge + change + previous in a standardized way.
 * Use this inside KPICardV2 value prop for consistent rendering.
 *
 * Badge displays only first word to prevent overflow (e.g., "Seller advantage" → "SELLER")
 */
interface KPIHeroContentProps {
  /** Main value (number or formatted string) */
  value: string | number;
  /** Optional unit suffix (e.g., "psf", "%") */
  unit?: string;
  /** Badge text and color (displays first word only, uppercased) */
  badge?: {
    text: string;
    color: 'green' | 'red' | 'gray';
  };
  /** Quarter-over-quarter change */
  change?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  /** Previous period value */
  previous?: {
    value: string | number;
    label?: string; // defaults to "Prev:"
  };
}

export function KPIHeroContent({
  value,
  unit,
  badge,
  change,
  previous,
}: KPIHeroContentProps) {
  // Luxury delta pill styling
  const isPositive = change?.direction === 'up';
  const isNegative = change?.direction === 'down';
  const pillClass = isPositive
    ? 'delta-pill delta-pill-positive'
    : isNegative
    ? 'delta-pill delta-pill-negative'
    : 'delta-pill delta-pill-neutral';
  const pctStr = change?.value != null
    ? (change.value >= 0 ? `+${change.value}%` : `${change.value}%`)
    : '';

  return (
    <>
      {/* Main value row with badge - Luxury font-medium styling */}
      <div
        className="text-[22px] sm:text-[28px] font-mono font-medium text-slate-900 tracking-tight truncate"
        title={badge ? `${value} ${badge.text}` : String(value)}
      >
        {value}
        {unit && (
          <span className="ml-1 text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-slate-500">
            {unit}
          </span>
        )}
        {badge && (
          <span className={`ml-1.5 text-xs font-medium uppercase tracking-wider whitespace-nowrap ${BADGE_COLORS[badge.color]}`}>
            {badge.text.split(' ')[0]}
          </span>
        )}
      </div>
      {/* QoQ change row - Luxury delta pill */}
      {change?.value != null && (
        <div className="mt-1">
          <span className={pillClass}>
            {pctStr} QoQ
          </span>
        </div>
      )}
      {/* Previous value row */}
      {previous && (
        <div className="text-[10px] sm:text-xs font-mono uppercase tracking-[0.18em] text-slate-400 mt-1">
          {previous.label || 'Prev:'} {previous.value}
        </div>
      )}
    </>
  );
}

export function KPICardV2({
  title,
  subtitle,
  tooltip,
  value,
  badge,
  trend: _trend,
  footnote,
  transition,
  loading = false,
  className = '',
  variant = 'card',
}: KPICardV2Props) {
  // Combine tooltip and footnote for hover display
  const footerText = footnote || transition;
  const combinedTooltip = [tooltip, footerText].filter(Boolean).join('\n\n');

  const isCell = variant === 'cell';

  // Loading state - show frost overlay
  if (loading) {
    return (
      <div
        className={`
          ${isCell ? '' : 'luxury-card'} overflow-hidden
          ${isCell ? 'h-full' : 'min-h-40'}
          ${className}
        `.trim()}
      >
        <FrostOverlay height={isCell ? 120 : 160} showSpinner={false} showProgress />
      </div>
    );
  }

  // Cell variant - minimal styling for HUD strip
  if (isCell) {
    return (
      <div
        className={`
          p-4 h-full flex flex-col
          ${className}
        `.trim()}
      >
        {/* Layer 1: Header - pinned to top */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500">
              {title}
            </span>
            {combinedTooltip && (
              <HelpTooltip content={combinedTooltip} />
            )}
          </div>
          {subtitle && (
            <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">
              {subtitle}
            </p>
          )}
        </div>

        {/* Layer 2: Hero Data - fills remaining space, aligned to bottom */}
        <div className="flex-1 flex items-end min-w-0">
          {typeof value === 'string' ? (
            <div className="truncate" title={badge ? `${value} ${badge.text}` : value}>
              <span className="text-[20px] sm:text-[24px] font-mono font-medium text-slate-900 leading-none tabular-nums">
                {value}
              </span>
              {badge && (
                <span className={`ml-1.5 text-[10px] font-medium uppercase tracking-wider whitespace-nowrap ${BADGE_COLORS[badge.color]}`}>
                  {badge.text.split(' ')[0]}
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-0.5 min-w-0 overflow-hidden">{value}</div>
          )}
        </div>
      </div>
    );
  }

  // Card variant (default) - standalone with luxury-card styling
  return (
    <div
      className={`
        luxury-card p-4 sm:p-5
        min-h-40 flex flex-col
        ${className}
      `.trim()}
    >
      {/* Layer 1: Header - pinned to top */}
      <div className="flex-shrink-0 mb-2">
        <div>
          <div className="flex items-center gap-1">
            <span className="luxury-label">
              {title}
            </span>
            {combinedTooltip && (
              <HelpTooltip content={combinedTooltip} />
            )}
          </div>
          {subtitle && (
            <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Layer 2: Hero Data - fills remaining space, aligned to bottom */}
      <div className="flex-1 flex items-end pb-2 min-w-0">
        {typeof value === 'string' ? (
          <div className="truncate" title={badge ? `${value} ${badge.text}` : value}>
             <span className="text-[22px] sm:text-[32px] font-mono font-medium text-slate-900 leading-none tabular-nums">
              {value}
            </span>
            {badge && (
              <span className={`ml-1.5 text-xs font-medium uppercase tracking-wider whitespace-nowrap ${BADGE_COLORS[badge.color]}`}>
                {badge.text.split(' ')[0]}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-1 min-w-0 overflow-hidden">{value}</div>
        )}
      </div>
    </div>
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
    <div className={`grid gap-3 md:gap-4 ${gridCols[columns]} ${className} overflow-visible`}>
      {children}
    </div>
  );
}

/**
 * KPIHudStrip - Unified HUD Strip for KPI Metrics
 *
 * Technical panel aesthetic with corner brackets.
 * Merges 4 KPIs into a single container with vertical dividers.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  KEY METRICS                                                             │
 * ├─────────────────┬─────────────────┬──────────────────┬───────────────────┤
 * │   Metric 1      │   Metric 2      │    Metric 3      │    Metric 4       │
 * └─────────────────┴─────────────────┴──────────────────┴───────────────────┘
 */
interface KPIHudStripProps {
  /** Section title displayed in header */
  title?: string;
  /** KPI cells to render (should be KPICardV2 with variant="cell") */
  children: React.ReactNode;
  /** Number of columns (default 4) */
  columns?: 2 | 3 | 4;
  /** Additional CSS classes */
  className?: string;
}

export function KPIHudStrip({
  title = 'KEY METRICS',
  children,
  columns = 4,
  className = '',
}: KPIHudStripProps) {
  // Grid columns mapping
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4',
  };

  // Convert children to array for mapping with dividers
  const childArray = React.Children.toArray(children);

  return (
    <div
      className={`
        relative bg-white border border-slate-300 overflow-hidden
        hud-corner
        ${className}
      `.trim()}
    >
      {/* Header - matches chart header styling exactly */}
      <div className="px-5 py-3 border-b border-slate-300 bg-slate-50/50">
        <h3 className="terminal-header text-slate-500">
          {title}
        </h3>
      </div>

      {/* KPI Grid - cells with vertical dividers (no gaps - brutalist touch) */}
      <div className={`grid ${gridCols[columns]} divide-x divide-slate-200`}>
        {childArray.map((child, index) => (
          <div
            key={index}
            className={`
              min-h-[120px]
              ${index >= columns ? 'border-t border-slate-200' : ''}
            `.trim()}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export default KPICardV2;
